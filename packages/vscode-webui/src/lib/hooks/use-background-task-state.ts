import { vscodeHost } from "@/lib/vscode";
import { type BackgroundTaskState, getLogger } from "@getpochi/common";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useLatest } from "./use-latest";

const logger = getLogger("UseBackgroundTaskState");

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
    logger.debug(
      {
        taskId,
        parentTaskId: state.parentTaskId,
        tools: state.tools?.length,
      },
      "Setting background task state",
    );
    return data?.setBackgroundTaskState(state);
  });

  return {
    backgroundTaskState: data?.value.value,
    setBackgroundTaskState,
    isLoading,
  };
};

async function fetchBackgroundTaskState(taskId: string) {
  logger.debug({ taskId }, "Fetching background task state");
  const result = await vscodeHost.readBackgroundTaskState(taskId);
  const value = threadSignal(result.value);
  logger.debug(
    {
      taskId,
      hasBackgroundTaskState: value.value !== undefined,
      parentTaskId: value.value?.parentTaskId,
      tools: value.value?.tools?.length,
    },
    "Fetched background task state",
  );
  return {
    value,
    setBackgroundTaskState: result.setBackgroundTaskState,
  };
}
