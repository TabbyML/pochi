import {
  BatchExecutionError,
  type CustomAgent,
  executePartitionedToolCalls,
  isReadonlyToolCall,
  partitionToolCalls,
} from "@getpochi/tools";
import type {
  QueueCancelReason,
  ScheduledToolCall,
} from "./scheduled-tool-call";

/** Maximum concurrent executions within one concurrent batch. */
const MaxConcurrency = 10;

type ToolCallQueueOptions = {
  getCustomAgents?: () => CustomAgent[] | undefined;
  concurrencyLimit?: number;
};

/** FIFO queue for one `taskId`. */
class ToolCallQueue {
  private queue: ScheduledToolCall[] = [];
  private processing = false;

  constructor(private readonly options: ToolCallQueueOptions = {}) {}

  enqueue(item: ScheduledToolCall) {
    this.queue.push(item);
  }

  start() {
    if (this.processing) return;
    this.processing = true;
    this.processAll().catch(() => {
      // Failures are surfaced through abort.
    });
  }

  clearPending(reason: QueueCancelReason) {
    const queue = this.queue.splice(0, this.queue.length);
    this.cancelItems(queue, reason);
  }

  private async processAll(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const queue = this.queue.splice(0, this.queue.length);
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
            execute: async (item) => {
              const result = await item.run();
              // Side-effecting tool calls are serial barriers, so an error here
              // cancels the remaining queued tool calls for this task.
              if (result.kind === "error" && this.shouldStopOnError(item)) {
                throw new Error(result.error);
              }
            },
          });
        } catch (error) {
          const pendingItems =
            error instanceof BatchExecutionError ? error.pendingItems : [];
          this.cancelItems(
            pendingItems.concat(this.queue),
            "previous-tool-call-failed",
          );
          this.queue = [];
          throw error;
        }
      }
    } finally {
      this.processing = false;
      if (this.queue.length > 0) {
        this.processing = true;
        this.processAll().catch(() => {
          // Failures are surfaced through abort.
        });
      }
    }
  }

  private cancelItems(items: ScheduledToolCall[], reason: QueueCancelReason) {
    for (const item of items) {
      item.cancel(reason);
    }
  }

  private shouldStopOnError(item: ScheduledToolCall): boolean {
    return !isReadonlyToolCall(
      item.toolName,
      item.input,
      this.options.getCustomAgents?.(),
    );
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
