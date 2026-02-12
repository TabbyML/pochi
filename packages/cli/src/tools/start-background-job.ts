import * as path from "node:path";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

export const startBackgroundJob =
  (
    context: ToolCallOptions,
  ): ToolFunctionType<ClientTools["startBackgroundJob"]> =>
  async ({ command, cwd = "." }, { cwd: workspaceDir, envs }) => {
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

    const id = backgroundJobManager.start(command, resolvedCwd, envs);

    return {
      backgroundJobId: id,
    };
  };
