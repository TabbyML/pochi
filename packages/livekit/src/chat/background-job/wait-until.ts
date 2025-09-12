import { backgroundJobManager } from "./manager";

/**
 * Wait for all background jobs to complete.
 * This should be called before shutting down to ensure data persistence.
 */
export async function waitForBackgroundJobs(): Promise<void> {
  await backgroundJobManager.waitForAllJobs();
}
