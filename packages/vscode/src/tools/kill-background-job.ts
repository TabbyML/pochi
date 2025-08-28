import { TerminalJob } from "@/integrations/terminal/terminal-job";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const killBackgroundJob: ToolFunctionType<
  ClientTools["killBackgroundJob"]
> = async ({ backgroundJobId }) => {
  const job = TerminalJob.get(backgroundJobId);
  if (!job) {
    throw new Error(`Background job with ID "${backgroundJobId}" not found.`);
  }

  job.kill();
  return { success: true };
};
