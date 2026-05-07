import { vscodeHost } from "@/lib/vscode";
import { type AsyncAgentState, getLogger } from "@getpochi/common";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useLatest } from "./use-latest";

const logger = getLogger("UseAsyncAgentState");

/**
 * Hook to read and manage AsyncAgentState for a task.
 * Uses ThreadSignal for real-time updates.
 * @useSignals this comment is needed to enable signals in this hook
 */
export const useAsyncAgentState = (taskId: string) => {
  const { data, isLoading } = useQuery({
    queryKey: ["asyncAgentState", taskId],
    queryFn: () => fetchAsyncAgentState(taskId),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const setAsyncAgentState = useLatest((state: AsyncAgentState) => {
    logger.debug(
      {
        taskId,
        parentTaskId: state.parentTaskId,
        tools: state.tools?.length,
      },
      "Setting async agent state",
    );
    return data?.setAsyncAgentState(state);
  });

  return {
    asyncAgentState: data?.value.value,
    setAsyncAgentState,
    isLoading,
  };
};

async function fetchAsyncAgentState(taskId: string) {
  logger.debug({ taskId }, "Fetching async agent state");
  const result = await vscodeHost.readAsyncAgentState(taskId);
  const value = threadSignal(result.value);
  logger.debug(
    {
      taskId,
      hasAsyncAgentState: value.value !== undefined,
      parentTaskId: value.value?.parentTaskId,
      tools: value.value?.tools?.length,
    },
    "Fetched async agent state",
  );
  return {
    value,
    setAsyncAgentState: result.setAsyncAgentState,
  };
}
