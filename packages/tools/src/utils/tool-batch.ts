import { MaxToolCallConcurrency } from "../constants";
import { isReadonlyToolCall } from "./readonly-validation";

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

export type BatchedToolCall = {
  toolCallId: string;
  toolName: string;
  input: unknown;
  run: () => Promise<BatchedToolCallResult>;
  cancel: (reason: BatchedToolCallCancelReason) => void | Promise<void>;
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

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = "BatchExecutionError";
    this.cause = cause;
  }
}

/**
 * Returns `true` if the tool call can share a concurrent microbatch without
 * becoming a barrier for subsequent batches.
 *
 * This is intentionally broader than `isReadonlyToolCall`:
 * - read-only tool calls are safe to batch;
 * - fire-and-forget tools like `startBackgroundJob` are also safe to batch;
 * - `newTask` is safe to batch because completion acknowledges task creation,
 *   while spawned work executes out-of-band.
 */
export function isSafeToBatchToolCall(
  toolName: string,
  input: unknown,
): boolean {
  if (toolName === "newTask") return true;

  if (isReadonlyToolCall(toolName, input)) return true;

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
export function partitionToolCalls(items: BatchedToolCall[]): ToolCallBatch[] {
  const batches: ToolCallBatch[] = [];
  let currentConcurrentBatch: BatchedToolCall[] = [];

  for (const item of items) {
    const isConcurrencySafe = isSafeToBatchToolCall(item.toolName, item.input);

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
  abortSignal,
}: {
  toolCalls: BatchedToolCall[];
  abortSignal?: AbortSignal;
}): Promise<void> {
  const batches = partitionToolCalls(toolCalls);

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
      throw new BatchExecutionError(BatchExecutionErrorMessages.FAILED, error);
    }
  }
}

/**
 * Queue for executing BatchedToolCalls sequentially (with internal concurrency
 * for safe-to-batch items). Once a tool call completes, it is removed from the queue
 * so that abort() only cancels truly pending items.
 */
export class ToolCallQueue {
  private queue: BatchedToolCall[] = [];
  private processing = false;
  private abortController: AbortController | null = null;

  enqueue(item: BatchedToolCall) {
    const removeFromQueue = () => {
      this.queue = this.queue.filter((q) => q.toolCallId !== item.toolCallId);
    };

    const wrappedItem: BatchedToolCall = {
      ...item,
      run: async () => {
        try {
          return await item.run();
        } finally {
          // Remove from queue once completed (success, error, or throw),
          // so abort() only cancels truly pending items.
          removeFromQueue();
        }
      },
      cancel: (reason) => {
        item.cancel(reason);
        removeFromQueue();
      },
    };
    this.queue.push(wrappedItem);
  }

  async start(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    this.abortController = new AbortController();
    try {
      await this.processAll();
    } finally {
      this.processing = false;
    }
  }

  private clearQueue() {
    this.queue = [];
    this.abortController = null;
  }

  private async cancelItems(
    items: BatchedToolCall[],
    reason: BatchedToolCallCancelReason,
  ): Promise<void> {
    await Promise.all(items.map((item) => item.cancel(reason)));
  }

  async abort(reason: BatchedToolCallCancelReason): Promise<void> {
    this.abortController?.abort(reason);
    await this.cancelItems(this.queue, reason);
    this.clearQueue();
  }

  private async processAll(): Promise<void> {
    try {
      const queue = this.queue;

      try {
        await executeToolCalls({
          toolCalls: queue,
          abortSignal: this.abortController?.signal,
        });
      } catch (error) {
        const reason: BatchedToolCallCancelReason =
          error instanceof BatchExecutionError &&
          error.message === BatchExecutionErrorMessages.FAILED
            ? "previous-tool-call-failed"
            : "user-abort";

        // At this point this.queue only contains items that haven't completed yet,
        // since completed items remove themselves via the enqueue wrapper.
        await this.abort(reason);
      }
    } finally {
      this.clearQueue();
    }
  }
}
