import { type ChildProcess, spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  type BackgroundJobTerminalEvent,
  type MonitorEventBatch,
  MonitorRateLimitedReason,
  MonitorWatcher,
  assertBackgroundJobReadInterval,
} from "@getpochi/common";
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
  monitor?: {
    description: string;
    watcher: MonitorWatcher;
    timedOut?: boolean;
    rateLimited?: boolean;
  };
}

export interface MonitorJobOptions {
  description: string;
  timeoutMs?: number;
}

export interface BackgroundJobStartResult {
  backgroundJobId: string;
  outputFile: string;
}

export interface BackgroundJobManagerOptions {
  taskId?: string;
  outputDir?: string;
}

type FinishListener = (event: BackgroundJobTerminalEvent) => void;

export class BackgroundJobManager {
  private jobs = new Map<string, BackgroundJob>();
  private maxOutputSize = 1024 * 1024;
  private readonly finishListeners = new Set<FinishListener>();
  private pendingMonitorEvents: MonitorEventBatch[] = [];

  constructor(private readonly options: BackgroundJobManagerOptions = {}) {}

  start(
    command: string,
    cwd: string,
    envs?: Record<string, string>,
    monitor?: MonitorJobOptions,
  ): BackgroundJobStartResult {
    const id = createBackgroundJobId(monitor ? "monitor" : "command");
    const outputFile = this.options.outputDir
      ? path.join(this.options.outputDir, `${id}.log`)
      : this.options.taskId
        ? getBackgroundJobOutputPath(this.options.taskId, id)
        : path.join(tmpdir(), "pochi-background-jobs", `${id}.log`);
    const outputWriter = new BackgroundJobOutputFile(outputFile);
    const child = spawn(command, {
      shell: getShellPath(),
      cwd,
      env: { ...process.env, ...getTerminalEnv(), ...envs },
      stdio: ["ignore", "pipe", "pipe"],
    });

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
      const watcher = new MonitorWatcher({
        onEvents: (lines) => {
          this.pendingMonitorEvents.push({
            backgroundJobId: id,
            description: monitor.description,
            lines,
          });
        },
        onTimeout: () => {
          if (job.monitor) job.monitor.timedOut = true;
          this.kill(id);
        },
        onRateLimitExceeded: () => {
          if (job.monitor) job.monitor.rateLimited = true;
          this.kill(id);
        },
        timeoutMs: monitor.timeoutMs,
      });
      job.monitor = { description: monitor.description, watcher };
    }

    const appendOutput = async (chunk: string) => {
      if (chunk.length === 0) return;
      await outputWriter.append(chunk);
      if (job.output.length + chunk.length > this.maxOutputSize) {
        const keep = this.maxOutputSize - chunk.length;
        job.output =
          keep > 0
            ? job.output.slice(-keep) + chunk
            : chunk.slice(-this.maxOutputSize);
      } else {
        job.output += chunk;
      }
    };

    let outputError: unknown;
    const processStream = async (
      stream: NodeJS.ReadableStream,
      isStdout: boolean,
    ) => {
      const sanitizer = new PlainOutputSanitizer();
      stream.setEncoding("utf8");
      for await (const chunk of stream) {
        const plainText = sanitizer.write(chunk as string);
        await appendOutput(plainText);
        if (isStdout && plainText.length > 0) {
          job.monitor?.watcher.ingest(plainText);
        }
      }
      const remainder = sanitizer.end();
      await appendOutput(remainder);
      if (isStdout && remainder.length > 0) {
        job.monitor?.watcher.ingest(remainder);
      }
    };
    const outputFinished = Promise.all([
      ...(child.stdout ? [processStream(child.stdout, true)] : []),
      ...(child.stderr ? [processStream(child.stderr, false)] : []),
    ]).catch((error) => {
      outputError = error;
      child.kill();
    });

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
    job.status = finalStatus;
    job.finalizing = false;

    let monitorReason =
      finalError ??
      (exitCode === undefined ? finalStatus : `exited with code ${exitCode}`);
    if (job.monitor?.rateLimited) {
      monitorReason = MonitorRateLimitedReason;
    } else if (job.monitor?.timedOut) {
      monitorReason = "killed after timeout";
    }
    this.endMonitor(job, monitorReason);

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

  private endMonitor(job: BackgroundJob, reason: string): void {
    if (!job.monitor) return;
    job.monitor.watcher.end();
    this.pendingMonitorEvents.push({
      backgroundJobId: job.id,
      description: job.monitor.description,
      lines: [],
      ended: { reason },
    });
    job.monitor = undefined;
  }

  drainMonitorEvents(): MonitorEventBatch[] {
    const events = this.pendingMonitorEvents;
    this.pendingMonitorEvents = [];
    return events;
  }

  hasPendingMonitorEvents(): boolean {
    return this.pendingMonitorEvents.length > 0;
  }

  getActiveMonitors(): Array<{ backgroundJobId: string; description: string }> {
    return Array.from(this.jobs.values()).flatMap((job) =>
      job.status === "running" && job.monitor
        ? [{ backgroundJobId: job.id, description: job.monitor.description }]
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
    const output = job.output;
    job.output = "";
    job.lastReadAt = now;
    return { output, status: job.status };
  }

  kill(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;
    if (job.status !== "running" || job.finalizing) return true;
    job.stopRequested = true;
    job.process.kill();
    return true;
  }

  killAll(): void {
    for (const job of this.jobs.values()) {
      if (job.status === "running" && !job.finalizing) {
        job.stopRequested = true;
        job.process.kill();
      }
      job.monitor?.watcher.dispose();
      job.monitor = undefined;
    }
    this.pendingMonitorEvents = [];
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
    wakeOnMonitorEvents = false,
  ): Promise<"completed" | "timeout" | "aborted" | "monitor-events"> {
    const startTime = Date.now();
    while (this.hasPendingJobs()) {
      if (wakeOnMonitorEvents && this.hasPendingMonitorEvents()) {
        return "monitor-events";
      }
      if (abortSignal?.aborted) return "aborted";
      if (timeoutMs > 0 && Date.now() - startTime >= timeoutMs)
        return "timeout";
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (wakeOnMonitorEvents && this.hasPendingMonitorEvents()) {
      return "monitor-events";
    }
    return "completed";
  }
}
