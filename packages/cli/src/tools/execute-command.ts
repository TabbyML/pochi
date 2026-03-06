import {
  type ExecException,
  type ExecOptionsWithStringEncoding,
  exec,
} from "node:child_process";
import * as path from "node:path";
import { getTerminalEnv } from "@getpochi/common/env-utils";
import {
  MaxTerminalOutputSize,
  fixExecuteCommandOutput,
  getShellPath,
} from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const executeCommand =
  (): ToolFunctionType<ClientTools["executeCommand"]> =>
  async (
    { command, cwd = ".", timeout = 120 },
    { abortSignal, cwd: workspaceDir, envs },
  ) => {
    if (!command) {
      throw new Error("Command is required to execute.");
    }

    let resolvedCwd: string;
    if (path.isAbsolute(cwd)) {
      resolvedCwd = path.normalize(cwd);
    } else {
      resolvedCwd = path.normalize(path.join(workspaceDir, cwd));
    }

    try {
      const {
        code,
        stdout = "",
        stderr = "",
      } = await execWithExitCode(timeout, command, {
        shell: getShellPath(),
        timeout: timeout * 1000, // Convert to milliseconds
        cwd: resolvedCwd,
        signal: abortSignal,
        env: { ...process.env, ...envs, ...getTerminalEnv() },
      });

      const { output, isTruncated } = processCommandOutput(
        stdout,
        stderr,
        code,
      );

      return {
        output,
        isTruncated,
      };
    } catch (error) {
      if (error instanceof Error) {
        // Handle abort signal
        if (error.name === "AbortError") {
          throw new Error("Command execution was aborted");
        }
      }

      // Handle other execution errors
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(errorMessage);
    }
  };

function isExecException(error: unknown): error is ExecException {
  return (
    error instanceof Error &&
    "cmd" in error &&
    "killed" in error &&
    "code" in error &&
    "signal" in error
  );
}

async function execWithExitCode(
  timeout: number,
  command: string,
  options: ExecOptionsWithStringEncoding,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return await new Promise<{ stdout: string; stderr: string; code: number }>(
    (resolve, reject) => {
      const child = exec(command, options, (err, stdout = "", stderr = "") => {
        if (!err) {
          resolve({
            stdout,
            stderr,
            code: 0,
          });
          return;
        }

        if (isExecException(err)) {
          if (err.signal === "SIGTERM" && err.killed) {
            reject(
              new Error(
                `Command execution timed out after ${timeout} seconds.`,
              ),
            );
            return;
          }

          resolve({
            stdout: err.stdout || "",
            stderr: err.stderr || "",
            code: err.code || 1,
          });
          return;
        }

        reject(err);
      });

      // Close stdin to force non-interactive behavior and avoid hanging prompts.
      child.stdin?.end();
    },
  );
}

function processCommandOutput(
  stdout: string,
  stderr: string,
  code: number,
): { output: string; isTruncated: boolean } {
  let fullOutput = fixExecuteCommandOutput(stdout + stderr);
  if (code !== 0) {
    fullOutput += `\nCommand exited with code ${code}`;
  }
  const isTruncated = fullOutput.length > MaxTerminalOutputSize;
  const output = isTruncated
    ? fullOutput.slice(-MaxTerminalOutputSize)
    : fullOutput;

  return { output, isTruncated };
}
