import { TerminalJob } from "@/integrations/terminal/terminal-job";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const killBackgroundJob: ToolFunctionType<
  ClientTools["killBackgroundJob"]
> = async ({ backgroundJobId }) => {
  const job = TerminalJob.get(backgroundJobId);
  if (!job) {
    if (backgroundJobId.startsWith("term-")) {
      throw new Error(
        `"${backgroundJobId}" is a user-opened terminal and cannot be killed. Only terminals started by startBackgroundJob (ids prefixed with "bgjob-") can be killed.`,
      );
    }
    throw new Error(`Background job with ID "${backgroundJobId}" not found.`);
  }

  job.kill();
  return { success: true };
};
