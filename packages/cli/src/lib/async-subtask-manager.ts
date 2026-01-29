import type { ExecuteCommandResult } from "@getpochi/common/vscode-webui-bridge";
import {
  type LiveKitStore,
  type TaskStatusLike,
  catalog,
  extractTaskResult,
  getTaskErrorMessage,
  mapTaskStatusToBackgroundStatus,
} from "@getpochi/livekit";

export type AsyncTaskOutput = {
  output: string;
  status: ExecuteCommandResult["status"];
  isTruncated: boolean;
  error?: string;
};

/**
 * Tracks async sub-tasks and provides a CLI-friendly way to read their results
 * through the readBackgroundJobOutput tool.
 */
export class AsyncSubTaskManager {
  private readonly asyncTaskIds = new Set<string>();

  constructor(private readonly store: LiveKitStore) {}

  registerTask(taskId: string) {
    this.asyncTaskIds.add(taskId);
  }

  /**
   * Read the latest attemptCompletion result for an async task.
   * Returns null when the task ID is unknown to the store.
   */
  readTaskOutput(taskId: string): AsyncTaskOutput | null {
    const task = this.store.query(catalog.queries.makeTaskQuery(taskId));
    if (!task) {
      return null;
    }

    // If the task is not marked async, we still allow reading it as a task ID.
    const status = mapTaskStatusToBackgroundStatus(
      task.status as TaskStatusLike,
    );
    if (status !== "completed") {
      return {
        output:
          "The task is currently running. You can continue working while it executes in the background.",
        status,
        isTruncated: false,
      };
    }

    let content = "";
    let extractionError: string | undefined;
    try {
      const rawResult = extractTaskResult(this.store, taskId);
      if (typeof rawResult === "string") {
        content = rawResult;
      } else if (rawResult !== undefined) {
        content = JSON.stringify(rawResult);
      }
    } catch (error) {
      extractionError =
        "The task has completed, but the output is not yet available.";
    }

    const error =
      task.status === "failed"
        ? (getTaskErrorMessage(task.error) ?? "The task failed.")
        : content
          ? undefined
          : (extractionError ??
            "The task completed successfully, but no result was returned via the attemptCompletion tool.");

    return {
      output: content,
      status,
      isTruncated: false,
      error,
    };
  }
}
