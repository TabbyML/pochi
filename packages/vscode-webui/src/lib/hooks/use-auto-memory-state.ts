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
export const useAutoMemoryState = (taskId: string) => {
  const { data, isLoading } = useQuery({
    queryKey: ["autoMemoryState", taskId],
    queryFn: () => fetchAutoMemoryState(taskId),
    staleTime: Number.POSITIVE_INFINITY,
  });

  return {
    autoMemoryState: data?.value.value ?? defaultAutoMemoryState,
    setAutoMemoryState: data?.setAutoMemoryState,
    isLoading,
  };
};

async function fetchAutoMemoryState(taskId: string) {
  const result = await vscodeHost.readAutoMemoryState(taskId);
  return {
    value: threadSignal(result.value),
    setAutoMemoryState: result.setAutoMemoryState,
  };
}
