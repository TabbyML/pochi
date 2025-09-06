import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/**
 * Hook to get custom agents
 * Uses ThreadSignal for real-time updates
 */
/** @useSignals */
export const useCustomAgents = () => {
  const { data: customAgentsSignal } = useQuery({
    queryKey: ["customAgents"],
    queryFn: async () => {
      return threadSignal(await vscodeHost.readCustomAgents());
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (customAgentsSignal === undefined) {
    return { data: [], isLoading: true };
  }

  return { customAgents: customAgentsSignal.value, isLoading: false };
};
