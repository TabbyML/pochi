import { type ToolUIPart, type UITools, getStaticToolName } from "ai";
import { MaxToolCallConcurrency } from "../constants";
import type { CustomAgent } from "../new-task";
import { isReadonlyToolCall } from "./readonly-constraints-validation";

export type BatchedToolCallCancelReason =
  | "user-abort"
  | "previous-tool-call-failed";

export type BatchedToolCallResult =
  | {
      kind: "success";
    }
  | {
      kind: "error";
      error: string;
    }
  | {
      kind: "cancelled";
      reason: BatchedToolCallCancelReason;
    };

export type BatchedToolCall = ToolUIPart<UITools> & {
  run: () => Promise<BatchedToolCallResult>;
  cancel: (reason: BatchedToolCallCancelReason) => void;
};

export type ToolCallBatch =
  | {
      isConcurrencySafe: true;
      items: BatchedToolCall[];
    }
  | {
      isConcurrencySafe: false;
      items: [BatchedToolCall];
    };

export const BatchExecutionErrorMessages = {
  ABORTED: "batch-execution-aborted",
  FAILED: "batch-execution-failed",
} as const;

export class BatchExecutionError extends Error {
  readonly cause: unknown;
  readonly failedToolCallId?: string;

  constructor(message: string, cause: unknown, failedToolCallId?: string) {
    super(message);
    this.name = "BatchExecutionError";
    this.cause = cause;
    this.failedToolCallId = failedToolCallId;
  }
}

function isSafeToBatchNewTask(
  input: Record<string, unknown>,
  customAgents: CustomAgent[] | undefined,
): boolean {
  if (input.runAsync === true) return true;
  return isReadonlyToolCall("newTask", input, customAgents);
}

/**
 * Returns `true` if the tool call can share a concurrent microbatch without
 * becoming a barrier for subsequent batches.
 *
 * This is intentionally broader than `isReadonlyToolCall`:
 * - read-only tool calls are safe to batch;
 * - fire-and-forget tools like `startBackgroundJob` are also safe to batch;
 * - `newTask({ runAsync: true })` is safe to batch because completion only
 *   acknowledges task creation, not the background work itself.
 */
export function isSafeToBatchToolCall(
  toolName: string,
  input: unknown,
  customAgents?: CustomAgent[],
): boolean {
  if (isReadonlyToolCall(toolName, input, customAgents)) return true;

  if (toolName === "newTask") {
    return isSafeToBatchNewTask(
      (input as Record<string, unknown>) ?? {},
      customAgents,
    );
  }

  if (toolName === "startBackgroundJob") return true;

  return false;
}

/**
 * Partition an ordered list of tool-call-backed items into microbatches:
 *
 * - Consecutive safe-to-batch calls → one concurrent batch.
 * - Each stateful call → its own single-element serial batch.
 *
 * Batches execute sequentially; batch N+1 only starts after N fully completes.
 */
export function partitionToolCalls(
  items: BatchedToolCall[],
  customAgents?: CustomAgent[],
): ToolCallBatch[] {
  const batches: ToolCallBatch[] = [];
  let currentConcurrentBatch: BatchedToolCall[] = [];

  for (const item of items) {
    const toolName = getStaticToolName(item);
    const isConcurrencySafe = isSafeToBatchToolCall(
      toolName,
      item.input,
      customAgents,
    );

    if (isConcurrencySafe) {
      currentConcurrentBatch.push(item);
    } else {
      if (currentConcurrentBatch.length > 0) {
        batches.push({
          isConcurrencySafe: true,
          items: currentConcurrentBatch,
        });
        currentConcurrentBatch = [];
      }
      batches.push({ isConcurrencySafe: false, items: [item] });
    }
  }

  if (currentConcurrentBatch.length > 0) {
    batches.push({
      isConcurrencySafe: true,
      items: currentConcurrentBatch,
    });
  }

  return batches;
}

export async function runConcurrentBatch(
  items: BatchedToolCall[],
  options: {
    concurrencyLimit: number;
  },
): Promise<void> {
  const { concurrencyLimit } = options;
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrencyLimit, 1), items.length);

  const runWorker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      if (item !== undefined) {
        try {
          await item.run();
        } catch {
          // Ignore concurrent-safe tool calls failures, do not block later items
          // in this batch or subsequent batches.
        }
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));
}

/**
 * Partition and execute an ordered list of tool calls in FIFO order.
 *
 * - consecutive safe-to-batch calls run concurrently up to `MaxToolCallConcurrency`
 * - concurrent batch failures are isolated; later batches still run
 * - each stateful call runs as a serial barrier
 * - when a serial barrier fails, later items are skipped and reported as pending
 * - if `abortSignal` is aborted before a batch starts, remaining items are reported as pending
 */
export async function executeToolCalls({
  toolCalls,
  customAgents,
  abortSignal,
}: {
  toolCalls: BatchedToolCall[];
  customAgents?: CustomAgent[];
  abortSignal?: AbortSignal;
}): Promise<void> {
  const batches = partitionToolCalls(toolCalls, customAgents);

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    if (!batch) continue;

    // Check before starting each new batch so an abort during execution
    // of the current batch stops any further batches from being dispatched.
    if (abortSignal?.aborted) {
      throw new BatchExecutionError(
        BatchExecutionErrorMessages.ABORTED,
        abortSignal.reason,
      );
    }

    if (batch.isConcurrencySafe) {
      await runConcurrentBatch(batch.items, {
        concurrencyLimit: MaxToolCallConcurrency,
      });
      continue;
    }

    const serialItem = batch.items[0];
    if (!serialItem) continue;

    try {
      const result = await serialItem.run();
      if (result.kind === "error") {
        // need to cancel the next batches
        throw new Error();
      }
    } catch (error) {
      throw new BatchExecutionError(
        BatchExecutionErrorMessages.FAILED,
        error,
        serialItem.toolCallId,
      );
    }
  }
}
