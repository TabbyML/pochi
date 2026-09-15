import { getLogger } from "@getpochi/common";

const logger = getLogger("TitleGenerationQueue");

interface TitleGenerationJob {
  id: string;
  waitUntil?: (promise: Promise<unknown>) => void;
  process: () => Promise<void>;
}

class TitleGenerationQueue {
  private jobs = Promise.resolve();
  private pendingJobs = new Map<string, TitleGenerationJob>();

  push(job: TitleGenerationJob) {
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
}

export const titleGenerationQueue = new TitleGenerationQueue();
