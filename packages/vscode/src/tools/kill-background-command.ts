import { TerminalJob } from "@/integrations/terminal/terminal-job";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const killBackgroundCommand: ToolFunctionType<
  ClientTools["killBackgroundCommand"]
> = async ({ backgroundCommandId }) => {
  const job = TerminalJob.get(backgroundCommandId);
  if (!job) {
    throw new Error(
      `Background command with ID "${backgroundCommandId}" not found.`,
    );
  }

  job.kill();
  return { success: true, _meta: { command: job.command } };
};
