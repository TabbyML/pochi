import { vscodeHost } from "@/lib/vscode";
import type { ContextWindowUsage } from "@getpochi/common";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useLatest } from "./use-latest";

/**
 * Hook to read and manage contextWindowUsage for a task.
 * Uses ThreadSignal for real-time updates.
 * @useSignals this comment is needed to enable signals in this hook
 */
export const useTaskContextWindowUsage = (taskId: string) => {
  const { data, isLoading } = useQuery({
    queryKey: ["contextWindowUsage", taskId],
    queryFn: () => fetchContextWindowUsage(taskId),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const setContextWindowUsage = useLatest(
    (contextWindowUsage: ContextWindowUsage) => {
      return data?.setContextWindowUsage(contextWindowUsage);
    },
  );

  return {
    contextWindowUsage: data?.value.value,
    setContextWindowUsage,
    isLoading,
  };
};

async function fetchContextWindowUsage(taskId: string) {
  const result = await vscodeHost.readContextWindowUsage(taskId);
  return {
    value: threadSignal(result.value),
    setContextWindowUsage: result.setContextWindowUsage,
  };
}
