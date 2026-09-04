import { spawn } from "node:child_process";
import * as path from "node:path";
import { getTerminalEnv } from "@getpochi/common/env-utils";
import {
  MaxTerminalOutputSize,
  fixExecuteCommandOutput,
  getShellPath,
} from "@getpochi/common/tool-utils";
import {
  type ClientTools,
  ExecuteCommandDefaultTimeoutSec,
  type ToolFunctionType,
  createBackgroundCommandResult,
} from "@getpochi/tools";
import type { BackgroundJobManager } from "../lib/background-job-manager";
import { ForegroundOutputCapture } from "../lib/foreground-output-capture";

interface ExecuteCommandContext {
  backgroundJobManager?: BackgroundJobManager;
}

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
  (
    context?: ExecuteCommandContext,
  ): ToolFunctionType<ClientTools["executeCommand"]> =>
  async (
    {
      command,
      cwd = ".",
      background = false,
      timeout = ExecuteCommandDefaultTimeoutSec,
    },
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

    if (background) {
      if (!context?.backgroundJobManager) {
        throw new Error("Background job manager not available.");
      }
      const { backgroundJobId, outputFile } =
        context.backgroundJobManager.start(command, resolvedCwd, envs);
      return createBackgroundCommandResult(backgroundJobId, outputFile);
    }

    try {
      const result = await executeForegroundCommand({
        command,
        cwd: resolvedCwd,
        envs,
        timeout,
        abortSignal,
        backgroundJobManager: context?.backgroundJobManager,
      });

      if ("backgroundJobId" in result) {
        return createBackgroundCommandResult(
          result.backgroundJobId,
          result.outputFile,
        );
      }

      return processCommandOutput(result.stdout, result.stderr);
    } catch (error) {
      if (error instanceof ExecuteCommandError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Command execution was aborted");
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(errorMessage);
    }
  };

interface ExecuteForegroundCommandOptions {
  command: string;
  cwd: string;
  envs?: Record<string, string>;
  timeout: number;
  abortSignal?: AbortSignal;
  backgroundJobManager?: BackgroundJobManager;
}

interface CompletedCommandResult {
  stdout: string;
  stderr: string;
}

interface PromotedCommandResult {
  backgroundJobId: string;
  outputFile: string;
}

function executeForegroundCommand({
  command,
  cwd,
  envs,
  timeout,
  abortSignal,
  backgroundJobManager,
}: ExecuteForegroundCommandOptions): Promise<
  CompletedCommandResult | PromotedCommandResult
> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: getShellPath(),
      cwd,
      env: { ...process.env, ...envs, ...getTerminalEnv() },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const outputCapture = new ForegroundOutputCapture(
      child.stdout,
      child.stderr,
    );
    let state: "foreground" | "promoted" | "settled" = "foreground";
    let stopReason: "abort" | "timeout" | undefined;

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const removeForegroundListeners = () => {
      if (timeoutHandle) clearTimeout(timeoutHandle);
      abortSignal?.removeEventListener("abort", onAbort);
      child.removeListener("close", onClose);
      child.removeListener("error", onError);
    };

    const settleStoppedCommand = async () => {
      if (state !== "foreground") return;
      state = "settled";
      removeForegroundListeners();
      let output: CompletedCommandResult;
      try {
        output = await outputCapture.finish();
      } catch (error) {
        reject(error);
        return;
      }
      if (stopReason === "abort") {
        reject(new DOMException("Command execution was aborted", "AbortError"));
        return;
      }

      reject(
        new ExecuteCommandError({
          message: `Command execution timed out after ${timeout} seconds.`,
          ...output,
          code: 1,
        }),
      );
    };

    const onClose = async (code: number | null) => {
      if (stopReason) {
        await settleStoppedCommand();
        return;
      }
      if (state !== "foreground") return;
      state = "settled";
      removeForegroundListeners();
      let output: CompletedCommandResult;
      try {
        output = await outputCapture.finish();
      } catch (error) {
        reject(error);
        return;
      }
      if (code === 0) {
        resolve(output);
        return;
      }
      reject(
        new ExecuteCommandError({
          message: `Command exited with code ${code ?? 1}`,
          ...output,
          code: code ?? 1,
        }),
      );
    };

    const onError = async (error: Error) => {
      if (state !== "foreground") return;
      if (stopReason) {
        await settleStoppedCommand();
        return;
      }
      state = "settled";
      removeForegroundListeners();
      try {
        await outputCapture.finish();
      } catch {
        // Preserve the process error when output cleanup also fails.
      }
      reject(error);
    };

    function onAbort() {
      if (state !== "foreground") return;
      stopReason = "abort";
      if (!child.kill()) void settleStoppedCommand();
    }

    const onTimeout = () => {
      if (state !== "foreground") return;
      if (!backgroundJobManager) {
        stopReason = "timeout";
        if (!child.kill()) void settleStoppedCommand();
        return;
      }

      state = "promoted";
      child.stdout.pause();
      child.stderr.pause();
      removeForegroundListeners();
      const initialOutput = outputCapture.promote();
      try {
        resolve(
          backgroundJobManager.adopt(
            child,
            command,
            initialOutput,
            abortSignal,
          ),
        );
      } catch (error) {
        state = "settled";
        child.kill();
        void initialOutput.dispose?.();
        reject(error);
      }
    };

    child.on("close", onClose);
    child.on("error", onError);
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    if (abortSignal?.aborted) {
      onAbort();
    } else {
      timeoutHandle = setTimeout(onTimeout, timeout * 1000);
    }
  });
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
