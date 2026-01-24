import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

export const killBackgroundJob =
  (
    context: ToolCallOptions,
  ): ToolFunctionType<ClientTools["killBackgroundJob"]> =>
  async ({ backgroundJobId }) => {
    const { backgroundJobManager } = context;
    if (!backgroundJobManager) {
      throw new Error("Background job manager not available.");
    }

    const success = backgroundJobManager.kill(backgroundJobId);
    if (!success) {
      throw new Error(`Background job with ID "${backgroundJobId}" not found.`);
    }

    return { success: true };
  };
