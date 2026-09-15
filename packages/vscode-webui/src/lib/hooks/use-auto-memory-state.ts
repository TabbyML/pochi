import { vscodeHost } from "@/lib/vscode";
import type { AutoMemoryTaskState } from "@getpochi/common";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

const defaultAutoMemoryState: AutoMemoryTaskState = {
  lastExtractionMessageCount: 0,
  isExtracting: false,
  extractionCount: 0,
  isDreaming: false,
};

/**
 * Hook to read and manage long-term memory state for a task.
 * @useSignals this comment is needed to enable signals in this hook
 */
export const useAutoMemoryState = (
  taskId: string,
  options: { enabled?: boolean } = {},
) => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["autoMemoryState", taskId],
    queryFn: () => fetchAutoMemoryState(taskId),
    enabled: options.enabled ?? true,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return {
    autoMemoryState: data?.value.value ?? defaultAutoMemoryState,
    setAutoMemoryState: data?.setAutoMemoryState,
    isLoading,
    error,
    stateStore: data?.stateStore,
  };
};

async function fetchAutoMemoryState(taskId: string) {
  const result = await vscodeHost.readAutoMemoryState(taskId);
  const value = threadSignal(result.value);
  return {
    value,
    setAutoMemoryState: result.setAutoMemoryState,
    // These callbacks keep reading the host signal after the page unmounts.
    stateStore: {
      get: () => value.value,
      set: (state: AutoMemoryTaskState) => result.setAutoMemoryState(state),
    },
  };
}
