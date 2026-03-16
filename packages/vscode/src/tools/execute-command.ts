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
  { abortSignal, cwd: workspaceDir, envs, builtinSubAgentInfo },
) => {
  const defaultTimeout = 120;
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

function isReadOnlyCommand(command: string): boolean {
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

  if (/[><|&;]/.test(command)) {
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
