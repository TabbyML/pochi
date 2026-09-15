import { useDefaultStore } from "@/lib/use-default-store";
import { BackgroundJobManager } from "@getpochi/livekit";
import { useSyncExternalStore } from "react";

export function useBackgroundJobList(taskId: string) {
  const manager = BackgroundJobManager.forStore(useDefaultStore());
  useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  return manager.getJobsForTask(taskId);
}

export function useBackgroundTaskStatus(taskId: string) {
  const manager = BackgroundJobManager.forStore(useDefaultStore());
  useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  return manager.getTaskStatus(taskId);
}
