import * as path from "node:path";
import { TerminalJob } from "@/integrations/terminal/terminal-job";
import { getWorkspaceFolder } from "@/lib/fs";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const startBackgroundJob: ToolFunctionType<
  ClientTools["startBackgroundJob"]
> = async ({ command, cwd = "." }, { abortSignal }) => {
  if (!command) {
    throw new Error("Command is required to execute.");
  }

  if (path.isAbsolute(cwd)) {
    cwd = path.normalize(cwd);
  } else {
    const workspaceRootUri = getWorkspaceFolder().uri;
    cwd = path.normalize(path.join(workspaceRootUri.fsPath, cwd));
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
