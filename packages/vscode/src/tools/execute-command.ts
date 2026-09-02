import * as path from "node:path";
import { getViewColumnForTerminal } from "@/integrations/layout";
import { TerminalJob } from "@/integrations/terminal/terminal-job";
import type { ExecuteCommandOptions } from "@/integrations/terminal/types";
import { getBackgroundJobTerminalName } from "@/lib/background-job-terminal-name";
import { getLogger } from "@getpochi/common";
import {
  getShellPath,
  maybePersistToolResult,
} from "@getpochi/common/tool-utils";
import type { ExecuteCommandResult } from "@getpochi/common/vscode-webui-bridge";
import {
  type ClientTools,
  ExecuteCommandDefaultTimeoutSec,
  type ToolFunctionType,
  createBackgroundCommandResult,
} from "@getpochi/tools";
import { signal } from "@preact/signals-core";
import {
  ThreadSignal,
  type ThreadSignalSerialization,
} from "@quilted/threads/signals";
import { funnel } from "remeda";
import { executeCommandWithNode } from "../integrations/terminal/execute-command-with-node";
import {
  PtySpawnError,
  executeCommandWithPty,
} from "../integrations/terminal/execute-command-with-pty";
import { ExecutionError } from "../integrations/terminal/utils";

const logger = getLogger("ExecuteCommand");
const ExecuteCommandStreamingThrottleMs = 300;

type CompletedCommandOutput = {
  output: string;
  isTruncated: boolean;
  error?: string;
};

export const executeCommand: ToolFunctionType<
  ClientTools["executeCommand"]
> = async (
  {
    command,
    cwd = ".",
    background = false,
    timeout = ExecuteCommandDefaultTimeoutSec,
  },
  { abortSignal, cwd: workspaceDir, envs, toolCallId, taskId },
) => {
  if (!command) {
    throw new Error("Command is required to execute.");
  }

  if (path.isAbsolute(cwd)) {
    cwd = path.normalize(cwd);
  } else {
    cwd = path.normalize(path.join(workspaceDir, cwd));
  }

  if (background) {
    if (!taskId) {
      throw new Error("A task ID is required to start a background job.");
    }

    const viewColumn = getViewColumnForTerminal();
    const location = viewColumn ? { viewColumn } : undefined;
    const job = await TerminalJob.create({
      name: getBackgroundJobTerminalName(command),
      command,
      cwd,
      location,
      abortSignal,
      taskId,
      ...(envs ? { envs } : {}),
    });

    return createBackgroundCommandResult(job.id, job.outputFile);
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

    let done = false;
    let pendingData: { output: string; isTruncated: boolean } | null = null;

    const throttledFlush = funnel(
      () => {
        if (done) return;
        const data = pendingData;
        if (!data) return;
        output.value = {
          content: data.output,
          status: "running",
          isTruncated: data.isTruncated,
        };
      },
      { minGapMs: ExecuteCommandStreamingThrottleMs, triggerAt: "both" },
    );

    executeCommandImpl({
      command,
      cwd,
      timeout,
      abortSignal,
      envs,
      onData: (data) => {
        pendingData = data;
        throttledFlush.call();
      },
    })
      .then(async (result) => {
        done = true;
        throttledFlush.cancel();

        if (result.type === "timedOut") {
          if (!taskId) {
            result.ptyProcess.kill();
            throw ExecutionError.createTimeoutError(timeout);
          }

          const viewColumn = getViewColumnForTerminal();
          const location = viewColumn ? { viewColumn } : undefined;
          const job = TerminalJob.adopt(result.ptyProcess, {
            name: getBackgroundJobTerminalName(command),
            command,
            cwd,
            location,
            abortSignal,
            taskId,
            ...(envs ? { envs } : {}),
          });
          const backgroundResult = createBackgroundCommandResult(
            job.id,
            job.outputFile,
          );
          output.value = {
            content: backgroundResult.output,
            status: "completed",
            isTruncated: backgroundResult.isTruncated,
            _meta: backgroundResult._meta,
          };
          return;
        }

        output.value = await persistCompletedOutput({
          output: result.output,
          isTruncated: result.isTruncated,
        });
      })
      .catch(async (error) => {
        const lastOutput = pendingData?.output ?? output.value.content;
        const lastTruncated =
          pendingData?.isTruncated ?? output.value.isTruncated;
        done = true;
        throttledFlush.cancel();
        output.value = await persistCompletedOutput({
          output: lastOutput,
          isTruncated: lastTruncated,
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

  // This is an internal streaming transport consumed by the WebUI bridge,
  // which converts it to the public foreground command result.
  return { streamingOutput: wrappedOutput } as never;
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

  const result = await executeCommandWithNode({
    command,
    cwd,
    timeout,
    abortSignal,
    envs,
    onData,
  });
  return { type: "completed" as const, ...result };
}
