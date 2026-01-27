import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

export const readBackgroundJobOutput =
  (
    context: ToolCallOptions,
  ): ToolFunctionType<ClientTools["readBackgroundJobOutput"]> =>
  async ({ backgroundJobId, regex }) => {
    const { backgroundJobManager, asyncSubTaskManager } = context;
    if (!backgroundJobManager) {
      throw new Error("Background job manager not available.");
    }

    const result = backgroundJobManager.readOutput(backgroundJobId, regex);
    if (result) {
      return {
        output: result.output,
        status: result.status,
        isTruncated: false,
      };
    }

    const taskResult = asyncSubTaskManager.readTaskOutput(backgroundJobId);
    if (!taskResult) {
      throw new Error(`Background job with ID "${backgroundJobId}" not found.`);
    }

    return {
      output: taskResult.output,
      status: taskResult.status,
      isTruncated: taskResult.isTruncated,
      ...(taskResult.error ? { error: taskResult.error } : {}),
    };
  };
