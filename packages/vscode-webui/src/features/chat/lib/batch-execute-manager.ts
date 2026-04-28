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
  private readonly queues = new Map<string, ToolCallQueue>();

  /** Enqueue a tool call into the queue for `taskId`. */
  enqueue(taskId: string, item: BatchedToolCall) {
    const queue = this.getOrCreateQueue(taskId);
    queue.enqueue(item);
  }

  /** Start processing the queue for `taskId`. */
  processQueue(taskId: string) {
    this.queues.get(taskId)?.start();
  }

  /** Abort queued tool calls for `taskId` by clearing pending items that have not started yet. */
  abort(taskId: string, reason: ToolCallCancelReason = "user-abort") {
    this.queues.get(taskId)?.abort(reason);
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
