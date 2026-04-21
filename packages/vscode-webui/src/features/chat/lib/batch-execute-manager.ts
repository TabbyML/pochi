import { getLogger } from "@getpochi/common";
import {
  BatchExecutionError,
  type CustomAgent,
  type ScheduledToolCallResult,
  executePartitionedToolCalls,
  partitionToolCalls,
} from "@getpochi/tools";

const logger = getLogger("ToolCallQueue");

export type QueueCancelReason = "user-abort" | "previous-tool-call-failed";

export type ScheduledToolCall = {
  toolName: string;
  input: unknown;
  run: () => Promise<ScheduledToolCallResult>;
  cancel: (reason: QueueCancelReason) => void;
};

/** Maximum concurrent executions within one concurrent batch. */
const MaxConcurrency = 10;

export type ToolCallQueueOptions = {
  getCustomAgents?: () => CustomAgent[] | undefined;
  concurrencyLimit?: number;
};

/** FIFO queue for one `taskId`. */
export class ToolCallQueue {
  private queue: ScheduledToolCall[] = [];
  private processing = false;

  constructor(private readonly options: ToolCallQueueOptions = {}) {}

  enqueue(item: ScheduledToolCall) {
    this.queue.push(item);
  }

  start() {
    if (this.processing) return;
    this.processing = true;
    this.processAll().catch((error) => {
      if (!(error instanceof BatchExecutionError)) {
        logger.error("Unexpected error in processAll", error);
      }
    });
  }

  clearPending(reason: QueueCancelReason) {
    const queue = this.queue.splice(0, this.queue.length);
    this.cancelItems(queue, reason);
  }

  private async processAll(): Promise<void> {
    try {
      const queue = this.queue;
      this.queue = [];
      const batches = partitionToolCalls(
        queue,
        (item) => ({
          toolName: item.toolName,
          input: item.input,
        }),
        this.options.getCustomAgents?.(),
      );

      try {
        await executePartitionedToolCalls(batches, {
          concurrencyLimit: this.options.concurrencyLimit ?? MaxConcurrency,
          execute: async (item, batchMode) => {
            const result = await item.run();
            logger.debug("execute result", {
              toolName: item.toolName,
              batchMode,
              resultKind: result.kind,
            });
            // Serial-batched tool calls are barriers; if they error, cancel
            // the remaining queued tool calls for this task.
            if (result.kind === "error" && batchMode === "serial") {
              logger.warn("serial tool call error, throwing", {
                toolName: item.toolName,
                error: result.error,
              });
              throw new Error(result.error);
            }
          },
        });
      } catch (error) {
        const pendingItems =
          error instanceof BatchExecutionError ? error.pendingItems : [];
        logger.warn("processAll catch, cancelling items", {
          pendingItemsCount: pendingItems.length,
          queueCount: this.queue.length,
          error,
        });
        this.cancelItems(
          pendingItems.concat(this.queue),
          "previous-tool-call-failed",
        );
        throw error;
      }
    } finally {
      this.processing = false;
    }
  }

  private cancelItems(items: ScheduledToolCall[], reason: QueueCancelReason) {
    for (const item of items) {
      item.cancel(reason);
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
 * stateful calls stay serial barriers. If the active batch fails, the manager
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
  enqueue(
    taskId: string,
    item: ScheduledToolCall,
    options?: ToolCallQueueOptions,
  ) {
    const queue = this.getOrCreateQueue(taskId, options);
    queue.enqueue(item);
  }

  /** Start processing the queue for `taskId`. */
  processQueue(taskId: string) {
    this.queues.get(taskId)?.start();
  }

  /** Abort queued tool calls for `taskId` by clearing pending items that have not started yet. */
  abort(taskId: string, reason: QueueCancelReason = "user-abort") {
    this.queues.get(taskId)?.clearPending(reason);
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
        concurrencyLimit: options?.concurrencyLimit ?? MaxConcurrency,
      });
      this.queues.set(taskId, queue);
    }
    return queue;
  }
}
