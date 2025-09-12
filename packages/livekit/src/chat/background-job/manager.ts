import { getLogger } from "@getpochi/common";

const logger = getLogger("BackgroundJobManager");

export interface BackgroundJob {
  id: string;
  waitUntil?: (promise: Promise<unknown>) => void;
  process: () => Promise<void>;
}

class BackgroundJobManager {
  private jobs = Promise.resolve();
  private pendingJobs = new Map<string, BackgroundJob>();

  push(job: BackgroundJob) {
    this.pendingJobs.set(job.id, job);

    this.jobs = this.jobs.then(() => {
      const nextJob = this.pendingJobs.values().next().value;
      if (!nextJob) {
        return Promise.resolve();
      }

      this.pendingJobs.delete(nextJob.id);

      return nextJob.process().catch((error) => {
        logger.error(`Failed to process job for task ${nextJob.id}`, error);
      });
    });

    job.waitUntil?.(this.jobs);
  }

  async waitForAllJobs(): Promise<void> {
    await this.jobs;
    // Also wait for any pending jobs that haven't started yet
    while (this.pendingJobs.size > 0) {
      await this.jobs;
    }
  }
}

export const backgroundJobManager = new BackgroundJobManager();
