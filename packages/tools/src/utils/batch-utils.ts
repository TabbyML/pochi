import type { CustomAgent } from "../new-task";
import {
  checkReadOnlyConstraints,
  isReadonlyToolCall,
} from "./readonly-constraints-validation";

export type ToolBatchMode = "concurrent" | "serial";

export type ToolBatch<T> = {
  mode: ToolBatchMode;
  items: T[];
};

export class BatchExecutionError<T> extends Error {
  readonly cause: unknown;
  readonly pendingItems: T[];

  constructor(message: string, cause: unknown, pendingItems: T[]) {
    super(message);
    this.name = "BatchExecutionError";
    this.cause = cause;
    this.pendingItems = pendingItems;
  }
}

export type ScheduledToolCallResult =
  | {
      kind: "success";
    }
  | {
      kind: "error";
      error: string;
    }
  | {
      kind: "cancelled";
      reason: "user-abort" | "user-reject" | "previous-tool-call-failed";
    };
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

export function getToolCallBatchMode(
  toolName: string,
  input: unknown,
  customAgents?: CustomAgent[],
): ToolBatchMode {
  return isSafeToBatchToolCall(toolName, input, customAgents)
    ? "concurrent"
    : "serial";
}

/**
 * Partition an ordered list of tool-call-backed items into microbatches:
 *
 * - Consecutive safe-to-batch calls → one concurrent batch.
 * - Each stateful call → its own single-element serial batch.
 *
 * Batches execute sequentially; batch N+1 only starts after N fully completes.
 */
export function partitionToolCalls<T>(
  items: T[],
  getToolCall: (item: T) => { toolName: string; input: unknown },
  customAgents?: CustomAgent[],
): ToolBatch<T>[] {
  const batches: ToolBatch<T>[] = [];
  let currentConcurrentBatch: T[] = [];

  for (const item of items) {
    const toolCall = getToolCall(item);
    const mode = getToolCallBatchMode(
      toolCall.toolName,
      toolCall.input,
      customAgents,
    );

    if (mode === "concurrent") {
      currentConcurrentBatch.push(item);
    } else {
      if (currentConcurrentBatch.length > 0) {
        batches.push({
          mode: "concurrent",
          items: currentConcurrentBatch,
        });
        currentConcurrentBatch = [];
      }
      batches.push({ mode: "serial", items: [item] });
    }
  }

  if (currentConcurrentBatch.length > 0) {
    batches.push({
      mode: "concurrent",
      items: currentConcurrentBatch,
    });
  }

  return batches;
}

export async function runConcurrentBatch<T>(
  items: T[],
  concurrencyLimit: number,
  execute: (item: T, batchMode: ToolBatchMode) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrencyLimit, 1), items.length);
  let firstError: unknown;

  const runWorker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      if (item !== undefined) {
        try {
          await execute(item, "concurrent");
        } catch (error) {
          firstError ??= error;
        }
      }
    }
  };

  await Promise.all(Array.from({ length: workerCount }, runWorker));

  if (firstError !== undefined) {
    throw firstError;
  }
}

/**
 * Run already-partitioned tool call batches in FIFO order.
 *
 * - concurrent batches run multiple items together up to `concurrencyLimit`
 * - concurrent batch failures are isolated to that batch; later batches still run
 * - serial batches run one item at a time and act as barriers
 * - when a serial batch fails, later batches are skipped and reported as pending
 */
export async function executePartitionedToolCalls<T>(
  batches: ToolBatch<T>[],
  execute: (item: T, batchMode: ToolBatchMode) => Promise<void>,
  options: {
    concurrencyLimit: number;
  },
): Promise<void> {
  const { concurrencyLimit } = options;

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    if (!batch) continue;

    try {
      if (batch.mode === "concurrent") {
        await runConcurrentBatch(batch.items, concurrencyLimit, execute);
      } else {
        for (let itemIndex = 0; itemIndex < batch.items.length; itemIndex++) {
          const item = batch.items[itemIndex];
          if (!item) continue;

          try {
            await execute(item, batch.mode);
          } catch (error) {
            throw new BatchExecutionError(
              "Serial batch execution failed",
              error,
              batch.items.slice(itemIndex + 1),
            );
          }
        }
      }
    } catch (error) {
      // Concurrent batches only contain side-effect-free tool calls, so one
      // failure should not affect later tool-call batches.
      if (batch.mode === "concurrent") {
        continue;
      }

      const cause = error instanceof BatchExecutionError ? error.cause : error;
      const pendingItems =
        error instanceof BatchExecutionError ? error.pendingItems : [];

      const remainingItems = pendingItems.concat(
        ...batches.slice(batchIndex + 1).map((nextBatch) => nextBatch.items),
      );

      throw new BatchExecutionError(
        "Batch execution failed",
        cause,
        remainingItems,
      );
    }
  }
}

export { checkReadOnlyConstraints, isReadonlyToolCall };
