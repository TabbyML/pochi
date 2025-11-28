import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/**
 * Hook to get pochi tasks state
 * Uses ThreadSignal for real-time updates
 */
/** @useSignals */
export const usePochiTasks = () => {
  const { data: pochiTasksSignal } = useQuery({
    queryKey: ["pochiTasks"],
    queryFn: fetchPochiTasks,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (pochiTasksSignal === undefined) {
    return {};
  }

  return pochiTasksSignal.value;
};

/**
 * Fetch pochi tasks from workspace API
 */
async function fetchPochiTasks() {
  return threadSignal(await vscodeHost.readPochiTasks());
}
