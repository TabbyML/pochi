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
    { abortSignal, cwd: workspaceDir, envs, builtinSubAgentInfo },
  ) => {
    if (!command) {
      throw new Error("Command is required to execute.");
    }

    if (builtinSubAgentInfo?.type === "explore") {
      const isReadOnly = isReadOnlyCommand(command);
      if (!isReadOnly) {
        throw new Error(
          `Command execution rejected: '${command}'. The 'explore' agent is restricted to read-only commands (e.g., git log, grep, cat, ls, find). Mutating commands are not allowed.`,
        );
      }
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

function isReadOnlyCommand(command: string): boolean {
  // A basic check to ensure the command only uses allowed read-only utilities.
  // This isn't foolproof but serves as a strong guardrail for the LLM.
  const allowedCommands = [
    "git",
    "grep",
    "rg",
    "cat",
    "ls",
    "find",
    "head",
    "tail",
    "less",
    "more",
    "wc",
    "awk",
    "sed",
    "echo",
    "pwd",
    "tree",
    "stat",
    "file",
  ];

  // Check if it contains obvious mutating operators
  if (/[><|&;]/.test(command)) {
    // Allow simple piping like `ls | grep` if we want, but for strict read-only it's safer to just check the base commands.
    // Let's parse out the first word of each piped command.
    const parts = command.split(/[|&;]/).map((p) => p.trim());
    return parts.every((part) => {
      if (!part) return true;
      const baseCmd = part.split(/\s+/)[0];
      return allowedCommands.includes(baseCmd);
    });
  }

  const baseCmd = command.trim().split(/\s+/)[0];
  if (!allowedCommands.includes(baseCmd)) {
    return false;
  }

  // Specifically for git, block non-read operations
  if (baseCmd === "git") {
    const gitSubCmd = command.trim().split(/\s+/)[1];
    const readonlyGitCmds = [
      "log",
      "diff",
      "status",
      "show",
      "branch",
      "grep",
      "ls-files",
      "ls-tree",
      "rev-parse",
      "blame",
    ];
    if (gitSubCmd && !readonlyGitCmds.includes(gitSubCmd)) {
      return false;
    }
  }

  return true;
}
