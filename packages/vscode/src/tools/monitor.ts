import * as path from "node:path";
import { getViewColumnForTerminal } from "@/integrations/layout";
import { MonitorRegistry } from "@/integrations/monitor/monitor-registry";
import { TerminalJob } from "@/integrations/terminal/terminal-job";
import { getBackgroundJobTerminalName } from "@/lib/background-job-terminal-name";
import { MonitorDefaultTimeoutMs } from "@getpochi/common";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const startMonitor: ToolFunctionType<
  ClientTools["startMonitor"]
> = async (
  { command, description, cwd = ".", timeoutMs, persistent },
  { abortSignal, cwd: workspaceDir, taskId },
) => {
  if (!command) {
    throw new Error("Command is required to execute.");
  }

  if (!taskId) {
    throw new Error("Monitor requires a task context.");
  }

  if (path.isAbsolute(cwd)) {
    cwd = path.normalize(cwd);
  } else {
    cwd = path.normalize(path.join(workspaceDir, cwd));
  }

  const viewColumn = getViewColumnForTerminal();
  const location = viewColumn ? { viewColumn } : undefined;

  const monitor = MonitorRegistry.createMonitor({
    taskId,
    description,
    timeoutMs: persistent ? undefined : (timeoutMs ?? MonitorDefaultTimeoutMs),
  });

  const job = TerminalJob.create({
    name: getBackgroundJobTerminalName(command),
    command,
    cwd,
    location,
    abortSignal,
    taskId,
    jobType: "monitor",
    monitor: monitor.hooks,
  });
  monitor.attach(job.id);

  return {
    backgroundJobId: job.id,
  };
};
