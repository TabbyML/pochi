import { type ChildProcess, spawn } from "node:child_process";
import * as crypto from "node:crypto";
import { getTerminalEnv } from "@getpochi/common/env-utils";
import { getShellPath } from "@getpochi/common/tool-utils";

export interface BackgroundJob {
  id: string;
  command: string;
  process: ChildProcess;
  output: string;
  startTime: number;
  status: "running" | "completed";
}

export class BackgroundJobManager {
  private jobs: Map<string, BackgroundJob> = new Map();
  private maxOutputSize = 1024 * 1024; // 1MB buffer limit per job

  start(command: string, cwd: string, envs?: Record<string, string>): string {
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
    });

    child.on("error", (err) => {
      job.status = "completed";
      appendOutput(`\nProcess execution error: ${err.message}\n`);
    });

    return id;
  }

  readOutput(
    id: string,
    regex?: string,
  ): { output: string; status: "running" | "completed" | "idle" } | null {
    const job = this.jobs.get(id);
    if (!job) {
      return null;
    }

    let outputToReturn = job.output;

    if (regex) {
      const re = new RegExp(regex);
      const lines = outputToReturn.split("\n");
      outputToReturn = lines.filter((line) => re.test(line)).join("\n");
    }

    job.output = ""; // Clear buffer

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
    }
    this.jobs.clear();
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
   * @returns Status of the wait operation: "completed", "timeout", or "aborted"
   */
  async waitForAllJobs(
    timeoutMs: number,
    abortSignal?: AbortSignal,
  ): Promise<"completed" | "timeout" | "aborted"> {
    const startTime = Date.now();
    const pollInterval = 1000;

    while (this.hasPendingJobs()) {
      if (abortSignal?.aborted) {
        return "aborted";
      }

      if (timeoutMs > 0 && Date.now() - startTime >= timeoutMs) {
        return "timeout";
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return "completed";
  }
}
