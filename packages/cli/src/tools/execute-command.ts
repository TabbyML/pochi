import {
  type ExecException,
  type ExecOptionsWithStringEncoding,
  exec,
} from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";
import {
  MaxTerminalOutputSize,
  fixExecuteCommandOutput,
  getShellPath,
} from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

export const executeCommand =
  (context: ToolCallOptions): ToolFunctionType<ClientTools["executeCommand"]> =>
  async ({ command, cwd = ".", timeout = 120 }, { abortSignal }) => {
    if (!command) {
      throw new Error("Command is required to execute.");
    }

    let resolvedCwd: string;
    if (path.isAbsolute(cwd)) {
      resolvedCwd = path.normalize(cwd);
    } else {
      resolvedCwd = path.normalize(path.join(context.cwd, cwd));
    }

    try {
      console.log("Executing command:", command, "in", resolvedCwd);
      const {
        code,
        stdout = "",
        stderr = "",
      } = await execWithExitCode(command, {
        shell: getShellPath(),
        timeout: timeout * 1000, // Convert to milliseconds
        cwd: resolvedCwd,
        signal: abortSignal,
        env: {
          ...process.env,
          PAGER: "cat",
          GIT_COMMITTER_NAME: "Pochi",
          GIT_COMMITTER_EMAIL: "noreply@getpochi.com",
        },
      });

      const fullOutput = fixExecuteCommandOutput(stdout + stderr);
      const isTruncated = fullOutput.length > MaxTerminalOutputSize;
      const output = isTruncated
        ? fullOutput.slice(-MaxTerminalOutputSize)
        : fullOutput;

      return {
        output,
        isTruncated,
        error: code === 0 ? undefined : `Command exited with code ${code}`,
      };
    } catch (error) {
      if (error instanceof Error) {
        // Handle abort signal
        if (error.name === "AbortError") {
          throw new Error("Command execution was aborted");
        }

        // Handle timeout
        const execError = error as ExecException;
        if (execError.signal === "SIGTERM" && execError.killed) {
          throw new Error(
            `Command execution timed out after ${timeout} seconds.`,
          );
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
  command: string,
  options: ExecOptionsWithStringEncoding,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const execCommand = promisify(exec);
  try {
    const { stdout, stderr } = await execCommand(command, options);
    return {
      stdout,
      stderr,
      code: 0,
    };
  } catch (err) {
    if (isExecException(err)) {
      return {
        stdout: err.stdout || "",
        stderr: err.stderr || "",
        code: err.code || 1,
      };
    }

    throw err;
  }
}
