import type { CustomAgent } from "../new-task";
import {
  BatchExecutionError,
  BatchExecutionErrorMessages,
  type BatchedToolCall,
  type BatchedToolCallCancelReason,
  executeToolCalls,
} from "./batch-utils";

export type ToolCallQueueOptions = {
  getCustomAgents?: () => CustomAgent[] | undefined;
  concurrencyLimit?: number;
};

/**
 * Queue for executing BatchedToolCalls sequentially (with internal concurrency
 * for safe-to-batch items). Once a tool call completes, it is removed from the queue
 * so that abort() only cancels truly pending items.
 */
export class ToolCallQueue {
  private queue: BatchedToolCall[] = [];
  private processing = false;
  private abortController: AbortController | null = null;

  constructor(private readonly options: ToolCallQueueOptions = {}) {}

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
    this.abortController?.abort();
    await this.cancelItems(this.queue, reason);
    this.clearQueue();
  }

  private async processAll(): Promise<void> {
    try {
      const queue = this.queue;

      try {
        await executeToolCalls({
          toolCalls: queue,
          customAgents: this.options.getCustomAgents?.(),
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
