import { getLogger } from "@getpochi/common";
import { getTerminalEnv } from "@getpochi/common/env-utils";
import { buildShellCommand } from "@getpochi/common/tool-utils";
import type * as nodePty from "node-pty";
import * as vscode from "vscode";
import type { ExecuteCommandOptions } from "./types";
import { ExecutionError, truncateOutput } from "./utils";

const logger = getLogger("ExecuteCommandWithPty");

export class PtySpawnError extends Error {
  constructor(cause: unknown) {
    super("Failed to spawn pty.");
    this.name = "PtySpawnError";
    this.cause = cause;
  }
}

const nodePtyPath = vscode.Uri.joinPath(
  vscode.Uri.file(vscode.env.appRoot),
  "node_modules",
  "node-pty",
  "lib",
  "index.js",
).toString();

export const toNonInteractivePtyCommand = (
  command: string,
  platform: NodeJS.Platform = process.platform,
): string => {
  if (platform === "win32") {
    return command;
  }

  return `( ${command} ) </dev/null`;
};

export const buildPtyEnv = (
  envs: Record<string, string> | undefined,
): NodeJS.ProcessEnv => {
  return {
    ...process.env,
    ...envs,
    ...getTerminalEnv(),
  };
};

export const buildPtyShellCommand = (
  command: string,
  platform: NodeJS.Platform = process.platform,
) => {
  return buildShellCommand(toNonInteractivePtyCommand(command, platform));
};

export const executeCommandWithPty = async ({
  command,
  cwd,
  timeout,
  abortSignal,
  onData,
  envs,
}: ExecuteCommandOptions) => {
  const shellCommand = buildPtyShellCommand(command);
  if (!shellCommand) {
    throw new PtySpawnError("Failed to get shell.");
  }

  let pty: typeof nodePty;
  try {
    pty = await import(nodePtyPath);
  } catch (error) {
    throw new PtySpawnError(error);
  }

  return new Promise<{ output: string; isTruncated: boolean }>(
    (resolve, reject) => {
      const { command: shell, args } = shellCommand;
      logger.debug(
        `Executing command with pty: ${command} in ${cwd}, shell: ${shell}, args: ${args}`,
      );
      const ptyProcess = pty.spawn(shell, args, {
        // Using 'xterm-256color' here helps ensure that the majority of Linux distributions will use a
        // color prompt as defined in the default ~/.bashrc file.
        name: "xterm-256color",
        cols: 80,
        rows: 30,
        cwd,
        env: buildPtyEnv(envs),
      });

      let output = "";
      let timeoutId: ReturnType<typeof setTimeout> | undefined;

      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          ptyProcess.kill("SIGTERM");
          reject(ExecutionError.createTimeoutError(timeout));
        }, timeout * 1000);
      }

      const onAbort = () => {
        ptyProcess.kill("SIGTERM");
        reject(ExecutionError.createAbortError());
      };
      abortSignal?.addEventListener("abort", onAbort);

      const dataListener = ptyProcess.onData((data: string) => {
        output = output + data;
        onData?.(truncateOutput(output));
      });

      const exitListener = ptyProcess.onExit(({ exitCode }) => {
        if (timeoutId) clearTimeout(timeoutId);
        abortSignal?.removeEventListener("abort", onAbort);
        dataListener.dispose();
        exitListener.dispose();

        if (exitCode === 0) {
          resolve(truncateOutput(output));
        } else {
          reject(
            ExecutionError.create(`Command exited with code ${exitCode}.`),
          );
        }
      });
    },
  );
};
