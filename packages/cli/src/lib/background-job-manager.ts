import { type ChildProcess, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import {
  type BackgroundJobTerminalEvent,
  type MonitorEventEnvelope,
  type MonitorJobOptions,
  MonitorWatcher,
} from "@getpochi/common";
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
  monitor?: {
    description: string;
    watcher: MonitorWatcher;
    endReason?: string;
    killTimer?: ReturnType<typeof setTimeout>;
  };
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

  private readonly monitorListeners = new Set<
    (event: MonitorEventEnvelope) => void
  >();
  private notificationVersion = 0;

  constructor(private readonly options: BackgroundJobManagerOptions = {}) {}

  start(
    command: string,
    cwd: string,
    envs?: Record<string, string>,
    monitor?: MonitorJobOptions,
  ): BackgroundJobStartResult {
    const child = spawn(command, {
      shell: getShellPath(),
      cwd,
      env: { ...process.env, ...getTerminalEnv(), ...envs },
      stdio: ["ignore", "pipe", "pipe"],
      detached: monitor !== undefined && process.platform !== "win32",
    });

    return this.register(child, command, undefined, undefined, monitor);
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
    monitor?: MonitorJobOptions,
  ): BackgroundJobStartResult {
    const id = createBackgroundJobId(monitor ? "monitor" : "command");
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
    if (monitor) {
      job.monitor = {
        description: monitor.description,
        watcher: new MonitorWatcher({
          onEvents: (lines) => this.emitMonitorEvent(job, lines),
          onTimeout: () => {
            if (job.monitor) job.monitor.endReason = "killed after timeout";
            this.kill(id);
          },
          onRateLimitExceeded: (reason) => {
            if (job.monitor) job.monitor.endReason = reason;
            this.kill(id);
          },
          timeoutMs: monitor.timeoutMs,
        }),
      };
    }

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
      isStdout: boolean,
    ) => {
      const append = async (text: string) => {
        await appendOutput(text);
        if (isStdout) job.monitor?.watcher.ingest(text);
      };
      const decoder = new StringDecoder("utf8");
      const sanitizer = new PlainOutputSanitizer();
      const initialOutputFinished = (async () => {
        for await (const chunk of initialOutputStream) {
          await append(sanitizer.write(decoder.write(chunk)));
        }
      })();
      const liveOutputFinished = stream
        ? new Promise<void>((resolve, reject) => {
            let liveOutputTail = initialOutputFinished;
            let settled = false;
            const cleanup = () => {
              stream.removeListener("data", onData);
              stream.removeListener("end", onFinished);
              stream.removeListener("close", onFinished);
              stream.removeListener("error", onError);
            };
            const settle = (error?: unknown) => {
              if (settled) return;
              settled = true;
              cleanup();
              liveOutputTail.then(
                () => (error === undefined ? resolve() : reject(error)),
                reject,
              );
            };
            const onData = (chunk: Buffer | string) => {
              stream.pause();
              liveOutputTail = liveOutputTail
                .then(() => append(sanitizer.write(decoder.write(chunk))))
                .then(() => {
                  if (!settled) stream.resume();
                });
              void liveOutputTail.catch(onError);
            };
            const onFinished = () => settle();
            const onError = (error: unknown) => settle(error);

            // Foreground capture pauses the child streams before handing them
            // off. Install the live listener first, then resume. Pausing again
            // on each chunk keeps the handoff bounded while initial output is
            // replayed and retains the chunk even if the stream closes.
            stream.on("data", onData);
            stream.once("end", onFinished);
            stream.once("close", onFinished);
            stream.once("error", onError);
            void initialOutputFinished.catch(onError);
            stream.resume();
          })
        : Promise.resolve();

      await Promise.all([initialOutputFinished, liveOutputFinished]);

      // StringDecoder buffers an incomplete trailing UTF-8 sequence. A
      // manually stopped process may end in the middle of a character, so
      // discard that partial sequence instead of flushing it as U+FFFD.
      if (!job.stopRequested) {
        await append(sanitizer.write(decoder.end()));
      }
      await append(sanitizer.end());
    };

    let outputError: unknown;
    const outputFinished = Promise.all([
      consumeOutput(child.stdout, initialOutput.stdout, true),
      consumeOutput(child.stderr, initialOutput.stderr, false),
    ])
      .finally(() => initialOutput.dispose?.())
      .catch((error) => {
        outputError = error;
        if (job.monitor) this.kill(job.id);
        else child.kill();
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
    clearTimeout(job.monitor?.killTimer);
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

    if (job.monitor) {
      job.monitor.watcher.end();
      this.emitMonitorEvent(job, [], {
        reason:
          job.monitor.endReason ??
          finalError ??
          `exited with code ${exitCode ?? "unknown"}`,
        status: finalStatus,
        ...(exitCode !== undefined ? { exitCode } : {}),
      });
      job.monitor = undefined;
      return;
    }
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
    this.notificationVersion++;
    for (const listener of this.finishListeners) listener(event);
  }

  onDidMonitorEvent(
    listener: (event: MonitorEventEnvelope) => void,
  ): () => void {
    this.monitorListeners.add(listener);
    return () => this.monitorListeners.delete(listener);
  }

  private emitMonitorEvent(
    job: BackgroundJob,
    lines: string[],
    ended?: MonitorEventEnvelope["ended"],
  ): void {
    if (!job.monitor) return;
    this.notificationVersion++;
    const event: MonitorEventEnvelope = {
      notificationId: crypto.randomUUID(),
      backgroundJobId: job.id,
      description: job.monitor.description,
      command: job.command,
      outputFile: job.outputFile,
      lines,
      ...(ended ? { ended } : {}),
    };
    for (const listener of this.monitorListeners) listener(event);
  }

  getActiveMonitors() {
    return Array.from(this.jobs.values()).flatMap((job) =>
      job.monitor && job.status === "running"
        ? [
            {
              backgroundJobId: job.id,
              description: job.monitor.description,
              outputFile: job.outputFile,
            },
          ]
        : [],
    );
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
    const signal = (name: NodeJS.Signals) => {
      if (job.monitor && job.process.pid && process.platform !== "win32") {
        try {
          process.kill(-job.process.pid, name);
          return true;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
      return job.process.kill(name);
    };
    if (job.monitor && !job.monitor.killTimer) {
      job.monitor.killTimer = setTimeout(() => signal("SIGKILL"), 1000);
    }
    return signal("SIGTERM");
  }

  killAll() {
    for (const job of this.jobs.values()) {
      if (job.status === "running" && !job.finalizing) {
        this.kill(job.id);
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
    wakeOnNotifications = false,
  ): Promise<"completed" | "timeout" | "aborted" | "notifications"> {
    const startTime = Date.now();
    const initialNotificationVersion = this.notificationVersion;
    const pollInterval = 50;

    while (
      this.hasPendingJobs() ||
      (wakeOnNotifications &&
        this.notificationVersion !== initialNotificationVersion)
    ) {
      if (
        wakeOnNotifications &&
        this.notificationVersion !== initialNotificationVersion
      ) {
        return "notifications";
      }
      if (abortSignal?.aborted) return "aborted";
      if (timeoutMs > 0 && Date.now() - startTime >= timeoutMs)
        return "timeout";
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return "completed";
  }
}
