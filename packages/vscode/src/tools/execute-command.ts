import * as path from "node:path";
import { TerminalJob } from "@/integrations/terminal/terminal-job";
import type { ExecuteCommandOptions } from "@/integrations/terminal/types";
import { waitForWebviewSubscription } from "@/integrations/terminal/utils";
import { getWorkspaceFolder } from "@/lib/fs";
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
  { command, cwd = ".", isBackground, timeout },
  { abortSignal, nonInteractive },
) => {
  const defaultTimeout = 120;
  if (!command) {
    throw new Error("Command is required to execute.");
  }

  if (path.isAbsolute(cwd)) {
    cwd = path.normalize(cwd);
  } else {
    const workspaceRootUri = getWorkspaceFolder().uri;
    cwd = path.normalize(path.join(workspaceRootUri.fsPath, cwd));
  }

  if (isBackground) {
    const job = TerminalJob.create({
      name: command,
      command,
      cwd,
      abortSignal: abortSignal,
      background: isBackground,
      timeout: timeout ?? defaultTimeout,
    });

    return {
      backgroundCommandId: job.id,
    };
  }
  const output = signal<ExecuteCommandResult>({
    content: "",
    status: "idle",
    isTruncated: false,
  });

  waitForWebviewSubscription().then(() => {
    executeCommandImpl({
      command,
      cwd,
      timeout: timeout ?? defaultTimeout,
      abortSignal,
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
      });
  });

  if (nonInteractive) {
    return new Promise((resolve) => {
      logger.debug(
        "Executing in non-interactive mode, waiting for output to complete...",
      );
      const unsubscribe = output.subscribe((outputResult) => {
        if (outputResult.status === "completed") {
          const result: {
            output: string;
            isTruncated: boolean;
            error?: string;
          } = {
            output: outputResult.content,
            isTruncated: outputResult.isTruncated ?? false,
          };
          // do not set error property if it is undefined
          if (outputResult.error) {
            result.error = outputResult.error;
          }

          unsubscribe();
          resolve(result);
        }
      });
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: pass thread signal
  return { output: ThreadSignal.serialize(output) as any };
};

async function executeCommandImpl({
  command,
  cwd,
  timeout,
  abortSignal,
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
    onData,
  });
}
