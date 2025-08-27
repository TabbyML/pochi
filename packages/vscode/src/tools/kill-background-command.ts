import { TerminalJob } from "@/integrations/terminal/terminal-job";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const killBackgroundCommand: ToolFunctionType<
  ClientTools["killBackgroundCommand"]
> = async ({ backgroundCommandId }) => {
  const job = TerminalJob.get(backgroundCommandId);
  if (!job) {
    return {
      success: false,
      error: `Background command with ID "${backgroundCommandId}" not found.`,
    };
  }

  try {
    job.kill();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
