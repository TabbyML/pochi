import { getLogger } from "@getpochi/common";
import {
  BatchExecutionError,
  BatchExecutionErrorMessages,
  type CustomAgent,
  MaxToolCallConcurrency,
  type QueueCancelReason,
  type ScheduledToolCall,
  executePartitionedToolCalls,
  partitionToolCalls,
} from "@getpochi/tools";

const logger = getLogger("ToolCallQueue");

export type ToolCallQueueOptions = {
  getCustomAgents?: () => CustomAgent[] | undefined;
  concurrencyLimit?: number;
};

/** FIFO queue for one `taskId`. */
export class ToolCallQueue {
  private queue: ScheduledToolCall[] = [];
  private processing = false;
  private abortController: AbortController | null = null;

  constructor(private readonly options: ToolCallQueueOptions = {}) {}

  enqueue(item: ScheduledToolCall) {
    this.queue.push(item);
  }

  start() {
    if (this.processing) return;
    this.processing = true;
    this.abortController = new AbortController();
    this.processAll().catch((error) => {
      if (!(error instanceof BatchExecutionError)) {
        logger.error("Unexpected error in processAll", error);
      }
    });
  }

  private clearQueue() {
    this.queue = [];
    this.abortController = null;
  }

  private cancelItems(items: ScheduledToolCall[], reason: QueueCancelReason) {
    for (const item of items) {
      item.cancel(reason);
    }
  }

  abort(reason: QueueCancelReason) {
    this.abortController?.abort();
    this.cancelItems(this.queue, reason);
    this.clearQueue();
  }

  private async processAll(): Promise<void> {
    try {
      const queue = this.queue;
      const batches = partitionToolCalls(
        queue,
        (item) => ({
          toolName: item.toolName,
          input: item.input,
        }),
        this.options.getCustomAgents?.(),
      );

      try {
        await executePartitionedToolCalls(
          batches,
          this.abortController?.signal,
        );
      } catch (error) {
        const reason: QueueCancelReason =
          error instanceof BatchExecutionError &&
          error.message === BatchExecutionErrorMessages.FAILED
            ? "previous-tool-call-failed"
            : "user-abort";

        if (error instanceof BatchExecutionError) {
          this.cancelItems(error.pendingItems as ScheduledToolCall[], reason);
        }

        this.abort(reason);
      }
    } finally {
      this.clearQueue();
      this.processing = false;
    }
  }
}

/**
 * Chat-scoped microbatch manager keyed by `taskId`.
 *
 * Each task id gets its own FIFO queue, so the main task and any subtasks are
 * isolated from one another even though they share one manager instance.
 *
 * Within a queue, consecutive safe-to-batch calls run as one concurrent batch;
 * stateful calls stay serial barriers. If a serial barrier fails, the manager
 * cancels the remaining queued items for that same task through each item's
 * `cancel()` adapter.
 */
export class BatchExecuteManager {
  private readonly queues = new Map<string, ToolCallQueue>();
  private readonly getDefaultCustomAgents: () => CustomAgent[] | undefined;

  constructor(
    customAgents?: CustomAgent[] | (() => CustomAgent[] | undefined),
  ) {
    this.getDefaultCustomAgents =
      typeof customAgents === "function" ? customAgents : () => customAgents;
  }

  /** Enqueue a tool call into the queue for `taskId`. */
  enqueue(taskId: string, item: ScheduledToolCall) {
    const queue = this.getOrCreateQueue(taskId);
    queue.enqueue(item);
  }

  /** Start processing the queue for `taskId`. */
  processQueue(taskId: string) {
    this.queues.get(taskId)?.start();
  }

  /** Abort queued tool calls for `taskId` by clearing pending items that have not started yet. */
  abort(taskId: string, reason: QueueCancelReason = "user-abort") {
    this.queues.get(taskId)?.abort(reason);
  }

  private getOrCreateQueue(
    taskId: string,
    options?: ToolCallQueueOptions,
  ): ToolCallQueue {
    let queue = this.queues.get(taskId);
    if (!queue) {
      queue = new ToolCallQueue({
        getCustomAgents:
          options?.getCustomAgents ?? this.getDefaultCustomAgents,
        concurrencyLimit: options?.concurrencyLimit ?? MaxToolCallConcurrency,
      });
      this.queues.set(taskId, queue);
    }
    return queue;
  }
}
