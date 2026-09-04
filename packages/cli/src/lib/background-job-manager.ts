import { type ChildProcess, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import type { BackgroundJobTerminalEvent } from "@getpochi/common";
import { assertBackgroundJobReadInterval } from "@getpochi/common";
import { getTerminalEnv } from "@getpochi/common/env-utils";
import {
  BackgroundJobOutputFile,
  PlainOutputSanitizer,
  createBackgroundJobId,
  getBackgroundJobOutputPath,
  getShellPath,
} from "@getpochi/common/tool-utils";

export interface BackgroundJob {
  id: string;
  command: string;
  process: ChildProcess;
  output: string;
  outputFile: string;
  outputWriter: BackgroundJobOutputFile;
  startTime: number;
  status: "running" | "completed" | "failed" | "stopped";
  lastReadAt?: number;
  stopRequested?: boolean;
  finalizing?: boolean;
  disposeAbort?: () => void;
}

export interface BackgroundJobStartResult {
  backgroundJobId: string;
  outputFile: string;
}

export type BackgroundJobInitialOutputStream =
  | Iterable<Buffer | string>
  | AsyncIterable<Buffer | string>;

export interface BackgroundJobInitialOutput {
  stdout: BackgroundJobInitialOutputStream;
  stderr: BackgroundJobInitialOutputStream;
  dispose?: () => Promise<void>;
}

export interface BackgroundJobManagerOptions {
  taskId?: string;
  outputDir?: string;
}

type FinishListener = (event: BackgroundJobTerminalEvent) => void;

export class BackgroundJobManager {
  private jobs: Map<string, BackgroundJob> = new Map();
  private maxOutputSize = 1024 * 1024; // compatibility buffer only
  private readonly finishListeners = new Set<FinishListener>();

  constructor(private readonly options: BackgroundJobManagerOptions = {}) {}

  start(
    command: string,
    cwd: string,
    envs?: Record<string, string>,
  ): BackgroundJobStartResult {
    const child = spawn(command, {
      shell: getShellPath(),
      cwd,
      env: { ...process.env, ...getTerminalEnv(), ...envs },
      stdio: ["ignore", "pipe", "pipe"],
    });

    return this.register(child, command);
  }

  adopt(
    child: ChildProcess,
    command: string,
    initialOutput: BackgroundJobInitialOutput,
    abortSignal?: AbortSignal,
  ): BackgroundJobStartResult {
    return this.register(child, command, initialOutput, abortSignal);
  }

  private register(
    child: ChildProcess,
    command: string,
    initialOutput: BackgroundJobInitialOutput = { stdout: [], stderr: [] },
    abortSignal?: AbortSignal,
  ): BackgroundJobStartResult {
    const id = createBackgroundJobId("command");
    const outputFile = this.options.outputDir
      ? path.join(this.options.outputDir, `${id}.log`)
      : this.options.taskId
        ? getBackgroundJobOutputPath(this.options.taskId, id)
        : path.join(tmpdir(), "pochi-background-jobs", `${id}.log`);
    const outputWriter = new BackgroundJobOutputFile(outputFile);
    const job: BackgroundJob = {
      id,
      command,
      process: child,
      output: "",
      outputFile,
      outputWriter,
      startTime: Date.now(),
      status: "running",
    };

    this.jobs.set(id, job);

    let appendTail = Promise.resolve();
    const appendOutput = (chunk: string): Promise<void> => {
      appendTail = appendTail.then(async () => {
        if (chunk.length === 0) return;
        await outputWriter.append(chunk);
        if (job.output.length + chunk.length > this.maxOutputSize) {
          const keep = this.maxOutputSize - chunk.length;
          if (keep > 0) {
            job.output = job.output.slice(-keep) + chunk;
          } else {
            job.output = chunk.slice(-this.maxOutputSize);
          }
        } else {
          job.output += chunk;
        }
      });
      return appendTail;
    };

    const consumeOutput = async (
      stream: Readable | null,
      initialOutputStream: BackgroundJobInitialOutputStream,
    ) => {
      const decoder = new StringDecoder("utf8");
      const sanitizer = new PlainOutputSanitizer();
      for await (const chunk of initialOutputStream) {
        await appendOutput(sanitizer.write(decoder.write(chunk)));
      }
      if (stream) {
        for await (const chunk of stream) {
          await appendOutput(sanitizer.write(decoder.write(chunk)));
        }
      }

      // StringDecoder buffers an incomplete trailing UTF-8 sequence. A
      // manually stopped process may end in the middle of a character, so
      // discard that partial sequence instead of flushing it as U+FFFD.
      if (!job.stopRequested) {
        await appendOutput(sanitizer.write(decoder.end()));
      }
      await appendOutput(sanitizer.end());
    };

    let outputError: unknown;
    const outputFinished = Promise.all([
      consumeOutput(child.stdout, initialOutput.stdout),
      consumeOutput(child.stderr, initialOutput.stderr),
    ])
      .finally(() => initialOutput.dispose?.())
      .catch((error) => {
        outputError = error;
        child.kill();
      });

    if (abortSignal) {
      const onAbort = () => {
        if (job.status !== "running" || job.finalizing) return;
        job.stopRequested = true;
        child.kill();
      };
      abortSignal.addEventListener("abort", onAbort, { once: true });
      job.disposeAbort = () =>
        abortSignal.removeEventListener("abort", onAbort);
      if (abortSignal.aborted) onAbort();
    }

    child.on("close", async (code) => {
      const status = job.stopRequested
        ? "stopped"
        : code === 0
          ? "completed"
          : "failed";
      try {
        await outputFinished;
        if (outputError) throw outputError;
        await this.finalize(job, status, code ?? undefined);
      } catch (error) {
        await this.finalize(
          job,
          "failed",
          code ?? undefined,
          error instanceof Error ? error.message : String(error),
        );
      }
    });

    child.on("error", async (error) => {
      await outputFinished.catch(() => undefined);
      await this.finalize(job, "failed", undefined, error.message);
    });

    return { backgroundJobId: id, outputFile };
  }

  onDidFinish(listener: FinishListener): () => void {
    this.finishListeners.add(listener);
    return () => this.finishListeners.delete(listener);
  }

  private async finalize(
    job: BackgroundJob,
    status: "completed" | "failed" | "stopped",
    exitCode?: number,
    error?: string,
  ): Promise<void> {
    if (job.status !== "running" || job.finalizing) return;
    job.finalizing = true;
    let finalStatus = status;
    let finalError = error;

    try {
      await job.outputWriter.close();
    } catch (closeError) {
      finalStatus = "failed";
      finalError =
        closeError instanceof Error ? closeError.message : String(closeError);
    }
    job.disposeAbort?.();
    job.status = finalStatus;
    job.finalizing = false;

    if (!this.options.taskId) return;
    const event: BackgroundJobTerminalEvent = {
      taskId: this.options.taskId,
      backgroundJobId: job.id,
      outputFile: job.outputFile,
      status: finalStatus,
      command: job.command,
      ...(exitCode !== undefined ? { exitCode } : {}),
      ...(finalError ? { error: finalError } : {}),
      finishedAt: Date.now(),
    };
    for (const listener of this.finishListeners) listener(event);
  }

  readOutput(id: string): {
    output: string;
    status: "running" | "completed" | "failed" | "stopped" | "idle";
  } | null {
    const job = this.jobs.get(id);
    if (!job) return null;

    const now = Date.now();
    assertBackgroundJobReadInterval({
      now,
      previousReadAt: job.lastReadAt,
      status: job.status === "running" ? "running" : "completed",
    });

    const outputToReturn = job.output;
    job.output = "";
    job.lastReadAt = now;

    return { output: outputToReturn, status: job.status };
  }

  kill(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status !== "running" || job.finalizing) return true;

    job.stopRequested = true;
    return job.process.kill();
  }

  killAll() {
    for (const job of this.jobs.values()) {
      if (job.status === "running" && !job.finalizing) {
        job.stopRequested = true;
        job.process.kill();
      }
    }
  }

  hasPendingJobs(): boolean {
    return Array.from(this.jobs.values()).some(
      (job) => job.status === "running" || job.finalizing,
    );
  }

  getPendingJobIds(): string[] {
    return Array.from(this.jobs.values())
      .filter((job) => job.status === "running" || job.finalizing)
      .map((job) => job.id);
  }

  async waitForAllJobs(
    timeoutMs: number,
    abortSignal?: AbortSignal,
  ): Promise<"completed" | "timeout" | "aborted"> {
    const startTime = Date.now();
    const pollInterval = 50;

    while (this.hasPendingJobs()) {
      if (abortSignal?.aborted) return "aborted";
      if (timeoutMs > 0 && Date.now() - startTime >= timeoutMs)
        return "timeout";
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return "completed";
  }
}
