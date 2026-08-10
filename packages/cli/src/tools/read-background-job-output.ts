import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

export const readBackgroundJobOutput =
  (
    context: ToolCallOptions,
  ): ToolFunctionType<ClientTools["readBackgroundJobOutput"]> =>
  async ({ backgroundJobId }) => {
    const { backgroundJobManager } = context;
    if (!backgroundJobManager) {
      throw new Error("Background job manager not available.");
    }

    const result = backgroundJobManager.readOutput(backgroundJobId);
    if (!result) {
      throw new Error(`Background job with ID "${backgroundJobId}" not found.`);
    }

    return {
      output: result.output,
      status: result.status,
      isTruncated: false,
    };
  };
