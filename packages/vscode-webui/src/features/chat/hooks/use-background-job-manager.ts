import { useDefaultStore } from "@/lib/use-default-store";
import { BackgroundJobManager } from "@getpochi/livekit";
import { useMemo } from "react";

export function useBackgroundJobManager(taskId: string) {
  const store = useDefaultStore();
  return useMemo(
    () => BackgroundJobManager.forStore(store).forTask(taskId),
    [store, taskId],
  );
}
