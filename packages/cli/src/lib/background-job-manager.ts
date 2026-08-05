import { type ChildProcess, spawn } from "node:child_process";
import * as crypto from "node:crypto";
import {
  type MonitorEventBatch,
  MonitorRateLimitedReason,
  MonitorWatcher,
  assertBackgroundJobReadInterval,
} from "@getpochi/common";
import { getTerminalEnv } from "@getpochi/common/env-utils";
import { getShellPath } from "@getpochi/common/tool-utils";

export interface BackgroundJob {
  id: string;
  command: string;
  process: ChildProcess;
  output: string;
  startTime: number;
  status: "running" | "completed";
  lastReadAt?: number;
  monitor?: {
    description: string;
    watcher: MonitorWatcher;
    timedOut?: boolean;
    rateLimited?: boolean;
  };
}

export interface MonitorJobOptions {
  description: string;
  /** Watch deadline. `undefined` means no timeout (persistent monitor). */
  timeoutMs?: number;
}

export class BackgroundJobManager {
  private jobs: Map<string, BackgroundJob> = new Map();
  private maxOutputSize = 1024 * 1024; // 1MB buffer limit per job
  private pendingMonitorEvents: MonitorEventBatch[] = [];

  start(
    command: string,
    cwd: string,
    envs?: Record<string, string>,
    monitor?: MonitorJobOptions,
  ): string {
    const id = crypto.randomUUID();

    const shell = getShellPath();
    const child = spawn(command, {
      shell,
      cwd,
      env: { ...process.env, ...getTerminalEnv(), ...envs },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const job: BackgroundJob = {
      id,

      command,
      process: child,
      output: "",
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
      child.stdout?.on("data", (data: Buffer | string) => {
        watcher.ingest(typeof data === "string" ? data : data.toString());
      });
    }

    const appendOutput = (data: Buffer | string) => {
      const chunk = typeof data === "string" ? data : data.toString();
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
    };

    child.stdout?.on("data", appendOutput);
    child.stderr?.on("data", appendOutput);

    child.on("close", (code) => {
      job.status = "completed";
      appendOutput(`\nProcess exited with code ${code}\n`);
      let reason = `exited with code ${code}`;
      if (job.monitor?.rateLimited) {
        reason = MonitorRateLimitedReason;
      } else if (job.monitor?.timedOut) {
        reason = "killed after timeout";
      }
      this.endMonitor(job, reason);
    });

    child.on("error", (err) => {
      job.status = "completed";
      appendOutput(`\nProcess execution error: ${err.message}\n`);
      this.endMonitor(job, `execution error: ${err.message}`);
    });

    return id;
  }

  private endMonitor(job: BackgroundJob, reason: string): void {
    if (!job.monitor) return;
    // Flushes any buffered lines through onEvents, then disposes timers.
    job.monitor.watcher.end();
    this.pendingMonitorEvents.push({
      backgroundJobId: job.id,
      description: job.monitor.description,
      lines: [],
      ended: { reason },
    });
    job.monitor = undefined;
  }

  /**
   * Takes all undelivered monitor event batches. The caller is responsible
   * for injecting them into the conversation.
   */
  drainMonitorEvents(): MonitorEventBatch[] {
    const events = this.pendingMonitorEvents;
    this.pendingMonitorEvents = [];
    return events;
  }

  hasPendingMonitorEvents(): boolean {
    return this.pendingMonitorEvents.length > 0;
  }

  readOutput(
    id: string,
    regex?: string,
  ): { output: string; status: "running" | "completed" | "idle" } | null {
    const job = this.jobs.get(id);
    if (!job) {
      return null;
    }

    const now = Date.now();
    const previousReadAt = job.lastReadAt;
    assertBackgroundJobReadInterval({
      now,
      previousReadAt,
      status: job.status,
    });

    let outputToReturn = job.output;

    if (regex) {
      const re = new RegExp(regex);
      const lines = outputToReturn.split("\n");
      outputToReturn = lines.filter((line) => re.test(line)).join("\n");
    }

    job.output = ""; // Clear buffer
    job.lastReadAt = now;

    return {
      output: outputToReturn,
      status: job.status,
    };
  }

  kill(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) {
      return false;
    }

    if (job.status === "completed") {
      return true;
    }

    const killed = job.process.kill();
    return killed;
  }

  killAll() {
    for (const job of this.jobs.values()) {
      if (job.status === "running") {
        job.process.kill();
      }
      // Clear watcher timers so they don't keep the process alive; the
      // task is over, so pending events no longer have a consumer.
      job.monitor?.watcher.dispose();
      job.monitor = undefined;
    }
    this.jobs.clear();
    this.pendingMonitorEvents = [];
  }

  hasPendingJobs(): boolean {
    for (const job of this.jobs.values()) {
      if (job.status === "running") {
        return true;
      }
    }
    return false;
  }

  getPendingJobIds(): string[] {
    const ids: string[] = [];
    for (const job of this.jobs.values()) {
      if (job.status === "running") {
        ids.push(job.id);
      }
    }
    return ids;
  }

  /**
   * Wait for all background jobs to complete.
   * @param timeoutMs Maximum time to wait in milliseconds (0 = no timeout)
   * @param abortSignal Optional abort signal to cancel waiting
   * @param wakeOnMonitorEvents Return early when monitor events are pending
   * @returns Status of the wait operation
   */
  async waitForAllJobs(
    timeoutMs: number,
    abortSignal?: AbortSignal,
    wakeOnMonitorEvents = false,
  ): Promise<"completed" | "timeout" | "aborted" | "monitor-events"> {
    const startTime = Date.now();
    const pollInterval = 1000;

    while (this.hasPendingJobs()) {
      if (wakeOnMonitorEvents && this.hasPendingMonitorEvents()) {
        return "monitor-events";
      }

      if (abortSignal?.aborted) {
        return "aborted";
      }

      if (timeoutMs > 0 && Date.now() - startTime >= timeoutMs) {
        return "timeout";
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    if (wakeOnMonitorEvents && this.hasPendingMonitorEvents()) {
      return "monitor-events";
    }

    return "completed";
  }
}
