import { vscodeHost } from "@/lib/vscode";
import type { BackgroundTaskState } from "@getpochi/common";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useLatest } from "./use-latest";

/**
 * Hook to read and manage BackgroundTaskState for a task.
 * Uses ThreadSignal for real-time updates.
 * @useSignals this comment is needed to enable signals in this hook
 */
export const useBackgroundTaskState = (taskId: string) => {
  const { data, isLoading } = useQuery({
    queryKey: ["backgroundTaskState", taskId],
    queryFn: () => fetchBackgroundTaskState(taskId),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const setBackgroundTaskState = useLatest((state: BackgroundTaskState) => {
    return data?.setBackgroundTaskState(state);
  });

  return {
    backgroundTaskState: data?.value.value,
    setBackgroundTaskState,
    isLoading,
  };
};

async function fetchBackgroundTaskState(taskId: string) {
  const result = await vscodeHost.readBackgroundTaskState(taskId);
  const value = threadSignal(result.value);
  return {
    value,
    setBackgroundTaskState: result.setBackgroundTaskState,
  };
}
