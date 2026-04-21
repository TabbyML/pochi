import * as path from "node:path";
import type { ExecuteCommandOptions } from "@/integrations/terminal/types";
import { getLogger } from "@getpochi/common";
import {
  getShellPath,
  maybePersistToolResult,
} from "@getpochi/common/tool-utils";
import type { ExecuteCommandResult } from "@getpochi/common/vscode-webui-bridge";
import {
  type ClientTools,
  type ToolFunctionType,
  validateExecuteCommandWhitelist,
} from "@getpochi/tools";
import { signal } from "@preact/signals-core";
import {
  ThreadSignal,
  type ThreadSignalSerialization,
} from "@quilted/threads/signals";
import { executeCommandWithNode } from "../integrations/terminal/execute-command-with-node";
import {
  PtySpawnError,
  executeCommandWithPty,
} from "../integrations/terminal/execute-command-with-pty";

const logger = getLogger("ExecuteCommand");

type CompletedCommandOutput = {
  output: string;
  isTruncated: boolean;
  error?: string;
};

export const executeCommand: ToolFunctionType<
  ClientTools["executeCommand"]
> = async (
  { command, cwd = ".", timeout },
  {
    abortSignal,
    cwd: workspaceDir,
    envs,
    toolCallId,
    taskId,
    executeCommandWhitelist,
  },
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

  if (executeCommandWhitelist && executeCommandWhitelist.length > 0) {
    validateExecuteCommandWhitelist(command, executeCommandWhitelist);
  }

  const output = signal<ExecuteCommandResult>({
    content: "",
    status: "idle",
    isTruncated: false,
  });
  let executionStarted = false;

  const persistCompletedOutput = async (
    result: CompletedCommandOutput,
  ): Promise<ExecuteCommandResult> => {
    const persisted = (await maybePersistToolResult(
      "executeCommand",
      toolCallId,
      taskId ?? "",
      result,
    )) as CompletedCommandOutput;

    return {
      content: persisted.output,
      status: "completed",
      isTruncated: persisted.isTruncated,
      ...(persisted.error ? { error: persisted.error } : {}),
    };
  };

  const startExecution = () => {
    if (executionStarted) return;
    executionStarted = true;

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
      .then(async ({ output: commandOutput, isTruncated }) => {
        output.value = await persistCompletedOutput({
          output: commandOutput,
          isTruncated,
        });
      })
      .catch(async (error) => {
        output.value = await persistCompletedOutput({
          output: output.value.content,
          isTruncated: output.value.isTruncated,
          error: error.message,
        });
      });
  };

  const serializedOutput = ThreadSignal.serialize(output);
  const wrappedOutput: ThreadSignalSerialization<ExecuteCommandResult> = {
    ...serializedOutput,
    start(
      subscriber: (value: ExecuteCommandResult) => void,
      options?: Parameters<typeof serializedOutput.start>[1],
    ) {
      const unsubscribe = serializedOutput.start(subscriber, options);
      startExecution();

      return unsubscribe;
    },
  };

  return {
    // biome-ignore lint/suspicious/noExplicitAny: pass thread signal
    output: wrappedOutput as any,
  };
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
