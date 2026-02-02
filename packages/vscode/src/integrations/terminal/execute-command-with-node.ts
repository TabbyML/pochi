import { type ChildProcess, exec, spawn } from "node:child_process";
import {
  buildShellCommand,
  fixExecuteCommandOutput,
} from "@getpochi/common/tool-utils";
import type { ExecuteCommandOptions } from "./types";
import { ExecutionError, truncateOutput } from "./utils";

/**
 * Executes a command in a shell
 * @param param0 - The options for executing the command
 * @param param0.command - The command to execute
 * @param param0.cwd - The working directory to execute the command in
 * @param param0.timeout - The timeout in seconds for the command execution
 * @param param0.abortSignal - Optional AbortSignal to cancel the command execution
 * @param param0.onData - Optional callback to receive output data as it is produced
 * @returns A promise that resolves with the final output or rejects on error
 */
export const executeCommandWithNode = async ({
  command,
  cwd,
  timeout,
  abortSignal,
  onData,
  color = true,
  envs,
}: ExecuteCommandOptions) => {
  const shellCommand = buildShellCommand(command);
  const options = {
    cwd,
    env: {
      ...process.env,
      ...(color
        ? {
            COLORTERM: "truecolor",
            TERM: "xterm-256color",
            FORCE_COLOR: "1",
            CLICOLOR_FORCE: "1",
          }
        : {}),
      ...envs,
    },
  };

  return new Promise<{ output: string; isTruncated: boolean }>(
    (resolve, reject) => {
      let child: ChildProcess;
      if (shellCommand) {
        child = spawn(shellCommand.command, shellCommand.args, {
          ...options,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } else {
        child = exec(command, options);
      }

      let output = "";
      let timeoutId: NodeJS.Timeout | undefined;

      // Set up timeout
      if (timeout > 0) {
        timeoutId = setTimeout(() => {
          child.kill("SIGTERM");
          reject(ExecutionError.createTimeoutError(timeout));
        }, timeout * 1000);
      }

      // Handle abort signal
      const onAbort = () => {
        child.kill("SIGTERM");
        reject(ExecutionError.createAbortError());
      };
      abortSignal?.addEventListener("abort", onAbort);

      // Stream stdout
      child.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        output = fixExecuteCommandOutput(output + chunk);
        onData?.(truncateOutput(output));
      });

      // Stream stderr
      child.stderr?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        output = fixExecuteCommandOutput(output + chunk);
        onData?.(truncateOutput(output));
      });

      child.on("close", (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        abortSignal?.removeEventListener("abort", onAbort);

        if (code === 0) {
          resolve(truncateOutput(output));
        } else {
          reject(ExecutionError.create(`Command exited with code ${code}`));
        }
      });

      child.on("error", (error) => {
        if (timeoutId) clearTimeout(timeoutId);
        abortSignal?.removeEventListener("abort", onAbort);
        reject(ExecutionError.create(`Command execution failed: ${error}`));
      });
    },
  );
};
