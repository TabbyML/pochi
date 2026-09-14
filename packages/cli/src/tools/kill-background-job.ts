import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

export const killBackgroundJob =
  (
    context: ToolCallOptions,
  ): ToolFunctionType<ClientTools["killBackgroundJob"]> =>
  async ({ backgroundJobId }) =>
    context.backgroundJobManager.kill(backgroundJobId);
