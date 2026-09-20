import {
  type BatchedToolCall,
  type ToolCallCancelReason,
  ToolCallQueue,
} from "@getpochi/tools";

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
  private readonly active = new Map<string, Promise<void>>();

  private readonly queues = new Map<string, ToolCallQueue>();

  /** Enqueue a tool call into the queue for `taskId`. */
  enqueue(taskId: string, item: BatchedToolCall) {
    const queue = this.getOrCreateQueue(taskId);
    queue.enqueue(item);
  }

  /** Start processing the queue for `taskId`. */
  processQueue(taskId: string) {
    const existing = this.active.get(taskId);
    if (existing) return existing;
    const run = this.queues.get(taskId)?.start();
    if (!run) return;
    this.active.set(taskId, run);
    void run
      .finally(() => {
        if (this.active.get(taskId) === run) this.active.delete(taskId);
      })
      .catch(() => undefined);
    return run;
  }

  /** Abort queued tool calls for `taskId` by clearing pending items that have not started yet. */
  abort(taskId: string, reason: ToolCallCancelReason = "user-abort") {
    return this.queues.get(taskId)?.abort(reason);
  }

  async stop(taskId: string, reason: ToolCallCancelReason = "user-abort") {
    const running = this.active.get(taskId);
    await this.abort(taskId, reason);
    await running;
  }

  private getOrCreateQueue(taskId: string): ToolCallQueue {
    let queue = this.queues.get(taskId);
    if (!queue) {
      queue = new ToolCallQueue();
      this.queues.set(taskId, queue);
    }
    return queue;
  }
}
