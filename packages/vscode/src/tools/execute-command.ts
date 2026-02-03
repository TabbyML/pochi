import * as path from "node:path";
import type { ExecuteCommandOptions } from "@/integrations/terminal/types";
import { waitForWebviewSubscription } from "@/integrations/terminal/utils";
import { getLogger } from "@getpochi/common";
import { getShellPath } from "@getpochi/common/tool-utils";
import type { ExecuteCommandResult } from "@getpochi/common/vscode-webui-bridge";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import { signal } from "@preact/signals-core";
import { ThreadSignal } from "@quilted/threads/signals";
import { executeCommandWithNode } from "../integrations/terminal/execute-command-with-node";
import {
  PtySpawnError,
  executeCommandWithPty,
} from "../integrations/terminal/execute-command-with-pty";

const logger = getLogger("ExecuteCommand");

export const executeCommand: ToolFunctionType<
  ClientTools["executeCommand"]
> = async (
  { command, cwd = ".", timeout },
  { abortSignal, cwd: workspaceDir, envs },
) => {
  const defaultTimeout = 120;
  if (!command) {
    throw new Error("Command is required to execute.");
  }

  if (path.isAbsolute(cwd)) {
    cwd = path.normalize(cwd);
  } else {
    cwd = path.normalize(path.join(workspaceDir, cwd));
  }

  const output = signal<ExecuteCommandResult>({
    content: "",
    status: "idle",
    isTruncated: false,
  });

  waitForWebviewSubscription().then(() =>
    executeCommandImpl({
      command,
      cwd,
      timeout: timeout ?? defaultTimeout,
      abortSignal,
      envs,
      onData: (data) => {
        output.value = {
          content: data.output,
          status: "running",
          isTruncated: data.isTruncated,
        };
      },
    })
      .then(({ output: commandOutput, isTruncated }) => {
        output.value = {
          content: commandOutput,
          status: "completed",
          isTruncated,
        };
      })
      .catch((error) => {
        output.value = {
          ...output.value,
          status: "completed",
          error: error.message,
        };
      }),
  );

  // Though stated in prompt that agent must run commands sequentially if needed (e.g git add . && git commit -m), in many cases model still generate two command in parallel.
  // Add a small delay here to reduce the occurances of .git/index.lock conflicts.
  await new Promise((resolve) => setTimeout(resolve, 100));

  // biome-ignore lint/suspicious/noExplicitAny: pass thread signal
  return { output: ThreadSignal.serialize(output) as any };
};

async function executeCommandImpl({
  command,
  cwd,
  timeout,
  abortSignal,
  envs,
  onData,
}: ExecuteCommandOptions) {
  const shell = getShellPath();
  // FIXME(zhiming): node-pty impl is not working on windows for now
  if (shell && process.platform !== "win32") {
    try {
      return await executeCommandWithPty({
        command,
        cwd,
        timeout,
        abortSignal,
        envs,
        onData,
      });
    } catch (error) {
      if (error instanceof PtySpawnError) {
        // should fallback
        logger.warn(
          `Failed to spawn pty, falling back to node's child_process.`,
          error.cause,
        );
      } else {
        // rethrow to exit
        throw error;
      }
    }
  }

  return await executeCommandWithNode({
    command,
    cwd,
    timeout,
    abortSignal,
    envs,
    onData,
  });
}
