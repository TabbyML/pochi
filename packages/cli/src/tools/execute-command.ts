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
import {
  type ClientTools,
  type ToolFunctionType,
  validateExecuteCommandWhitelist,
} from "@getpochi/tools";

export class ExecuteCommandError extends Error {
  public code: number;
  public stdout: string;
  public stderr: string;

  constructor({
    message,
    code,
    stdout,
    stderr,
  }: { message: string; code: number; stdout: string; stderr: string }) {
    super(message);
    this.name = "ExecuteCommandError";
    this.code = code;
    this.stdout = stdout;
    this.stderr = stderr;
  }

  asOutput() {
    return processCommandOutput(this.stdout, this.stderr, this.message);
  }
}

export const executeCommand =
  (): ToolFunctionType<ClientTools["executeCommand"]> =>
  async (
    { command, cwd = ".", timeout = 120 },
    { abortSignal, cwd: workspaceDir, envs, executeCommandWhitelist },
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

    if (executeCommandWhitelist && executeCommandWhitelist.length > 0) {
      validateExecuteCommandWhitelist(command, executeCommandWhitelist);
    }

    try {
      const { stdout = "", stderr = "" } = await execWithExitCode(command, {
        shell: getShellPath(),
        timeout: timeout * 1000, // Convert to milliseconds
        cwd: resolvedCwd,
        signal: abortSignal,
        env: { ...process.env, ...envs, ...getTerminalEnv() },
      });

      return processCommandOutput(stdout, stderr);
    } catch (error) {
      if (error instanceof ExecuteCommandError) {
        throw error;
      }

      // Handle abort signal
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Command execution was aborted");
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
  command: string,
  options: ExecOptionsWithStringEncoding,
): Promise<{ stdout: string; stderr: string; code: 0 }> {
  return await new Promise<{ stdout: string; stderr: string; code: 0 }>(
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
          if (
            err.signal === "SIGTERM" &&
            err.killed &&
            options.timeout &&
            options.timeout > 0
          ) {
            reject(
              new ExecuteCommandError({
                message: `Command execution timed out after ${options.timeout / 1000} seconds.`,
                stdout: err.stdout ?? stdout ?? "",
                stderr: err.stderr ?? stderr ?? "",
                code: err.code ?? 1,
              }),
            );
            return;
          }

          reject(
            new ExecuteCommandError({
              message: `Command exited with code ${err.code ?? 1}`,
              stdout: err.stdout ?? stdout ?? "",
              stderr: err.stderr ?? stderr ?? "",
              code: err.code ?? 1,
            }),
          );
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
  errorMessage?: string,
): { output: string; isTruncated: boolean; error?: string } {
  const fullOutput = fixExecuteCommandOutput(stdout + stderr);
  const isTruncated = fullOutput.length > MaxTerminalOutputSize;
  const output = isTruncated
    ? fullOutput.slice(-MaxTerminalOutputSize)
    : fullOutput;

  if (errorMessage) {
    return {
      output,
      isTruncated,
      error: errorMessage,
    };
  }

  return { output, isTruncated };
}
