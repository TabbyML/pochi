import { vscodeHost } from "@/lib/vscode";
import type { TaskMemoryState } from "@getpochi/common/vscode-webui-bridge";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

const defaultTaskMemoryState: TaskMemoryState = {
  initialized: false,
  lastExtractionTokens: 0,
  lastExtractionToolCalls: 0,
  isExtracting: false,
  extractionCount: 0,
};

/**
 * Hook to read and manage TaskMemoryState for a task.
 * Uses ThreadSignal for real-time updates.
 * @useSignals this comment is needed to enable signals in this hook
 */
export const useTaskMemoryState = (taskId: string) => {
  const { data, isLoading } = useQuery({
    queryKey: ["taskMemoryState", taskId],
    queryFn: () => fetchTaskMemoryState(taskId),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const taskMemoryState = data?.value.value ?? defaultTaskMemoryState;
  const setTaskMemoryState = data?.setTaskMemoryState;

  return {
    taskMemoryState,
    setTaskMemoryState,
    isLoading,
  };
};

async function fetchTaskMemoryState(taskId: string) {
  const result = await vscodeHost.readTaskMemoryState(taskId);
  return {
    value: threadSignal(result.value),
    setTaskMemoryState: result.setTaskMemoryState,
  };
}
