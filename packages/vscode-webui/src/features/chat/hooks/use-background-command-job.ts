import { useDefaultStore } from "@/lib/use-default-store";
import { BackgroundJobManager } from "@getpochi/livekit";
import { useCallback, useSyncExternalStore } from "react";

/**
 * What the manager knows about a background command (or monitor): how it
 * ended, and a way to stop it while it runs. Undefined for jobs this webview
 * does not track, e.g. those of another task or a user terminal.
 */
export function useBackgroundCommandJob(backgroundJobId: string) {
  const manager = BackgroundJobManager.forStore(useDefaultStore());
  useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const job = manager.getCommandJob(backgroundJobId);
  const ownerTaskId = job?.ownerTaskId;
  const stop = useCallback(async () => {
    if (!ownerTaskId) return;
    await manager.forTask(ownerTaskId).kill(backgroundJobId);
  }, [manager, ownerTaskId, backgroundJobId]);
  return job && { status: job.status, exitCode: job.exitCode, stop };
}
