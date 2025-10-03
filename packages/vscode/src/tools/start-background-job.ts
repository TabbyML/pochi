import * as path from "node:path";
import { TerminalJob } from "@/integrations/terminal/terminal-job";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const startBackgroundJob: ToolFunctionType<
  ClientTools["startBackgroundJob"]
> = async ({ command, cwd = "." }, { abortSignal, cwd: workspaceDir }) => {
  if (!command) {
    throw new Error("Command is required to execute.");
  }

  if (path.isAbsolute(cwd)) {
    cwd = path.normalize(cwd);
  } else {
    cwd = path.normalize(path.join(workspaceDir, cwd));
  }

  const job = TerminalJob.create({
    name: command,
    command,
    cwd,
    abortSignal: abortSignal,
  });

  return {
    backgroundJobId: job.id,
  };
};
