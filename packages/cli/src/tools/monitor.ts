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
    const { backgroundJobManager } = context;
    if (!backgroundJobManager) {
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

    const { backgroundJobId } = backgroundJobManager.start(
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

    return { backgroundJobId };
  };
