import { vscodeHost } from "@/lib/vscode";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

/**
 * Hook to read and manage mcpConfigOverride for a task.
 * Uses ThreadSignal for real-time updates.
 * @useSignals this comment is needed to enable signals in this hook
 */
export const useTaskMcpConfigOverride = (taskId: string) => {
  const { data, isLoading } = useQuery({
    queryKey: ["mcpConfigOverride", taskId],
    queryFn: () => fetchMcpConfigOverride(taskId),
    staleTime: Number.POSITIVE_INFINITY,
  });

  return {
    mcpConfigOverride: data?.value.value,
    setMcpConfigOverride: data?.setMcpConfigOverride,
    isLoading,
  };
};

async function fetchMcpConfigOverride(taskId: string) {
  const result = await vscodeHost.readMcpConfigOverride(taskId);
  return {
    value: threadSignal(result.value),
    setMcpConfigOverride: result.setMcpConfigOverride,
  };
}
