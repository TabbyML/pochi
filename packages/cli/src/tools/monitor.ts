import * as path from "node:path";
import { MonitorDefaultTimeoutMs } from "@getpochi/common";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

export const startMonitor =
  (context: ToolCallOptions): ToolFunctionType<ClientTools["startMonitor"]> =>
  async (
    { command, description, cwd = ".", timeoutMs, persistent },
    { cwd: workspaceDir, envs },
  ) => {
    const { adaptor, taskId } = context;
    if (!adaptor || !taskId) {
      throw new Error("Background job manager not available.");
    }

    if (!command) {
      throw new Error("Command is required to execute.");
    }

    let resolvedCwd: string;
    if (path.isAbsolute(cwd)) {
      resolvedCwd = path.normalize(cwd);
    } else {
      resolvedCwd = path.normalize(path.join(workspaceDir, cwd));
    }

    const { backgroundJobId, outputFile } = adaptor.startBackgroundCommand(
      taskId,
      command,
      resolvedCwd,
      envs,
      {
        description,
        timeoutMs: persistent
          ? undefined
          : (timeoutMs ?? MonitorDefaultTimeoutMs),
      },
    );

    return { backgroundJobId, outputFile };
  };
