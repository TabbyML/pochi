import * as path from "node:path";
import { getViewColumnForTerminal } from "@/integrations/layout";
import { TerminalJob } from "@/integrations/terminal/terminal-job";
import { getBackgroundJobTerminalName } from "@/lib/background-job-terminal-name";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const startBackgroundJob: ToolFunctionType<
  ClientTools["startBackgroundJob"]
> = async (
  { command, cwd = "." },
  { abortSignal, cwd: workspaceDir, taskId },
) => {
  if (!command) {
    throw new Error("Command is required to execute.");
  }
  if (!taskId) {
    throw new Error("A task ID is required to start a background job.");
  }

  if (path.isAbsolute(cwd)) {
    cwd = path.normalize(cwd);
  } else {
    cwd = path.normalize(path.join(workspaceDir, cwd));
  }

  const viewColumn = getViewColumnForTerminal();
  const location = viewColumn ? { viewColumn } : undefined;

  const job = TerminalJob.create({
    name: getBackgroundJobTerminalName(command),
    command,
    cwd,
    location,
    abortSignal: abortSignal,
    taskId,
  });

  return {
    backgroundJobId: job.id,
    outputFile: job.outputFile,
  };
};
