import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/**
 * Hook to get visible terminals
 * Uses ThreadSignal for real-time updates
 */
/** @useSignals */
export const useVisibleTerminals = () => {
  const { data } = useQuery({
    queryKey: ["visibleTerminals"],
    queryFn: fetchVisibleTerminals,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (!data) {
    return { terminals: [], openBackgroundJobTerminal: undefined };
  }

  return {
    terminals: data.terminals.value,
    openBackgroundJobTerminal: data?.openBackgroundJobTerminal,
  };
};

/**
 * Fetch visible terminals from workspace API
 */
async function fetchVisibleTerminals() {
  const result = await vscodeHost.readVisibleTerminals();
  return {
    terminals: threadSignal(result.terminals),
    openBackgroundJobTerminal: result.openBackgroundJobTerminal,
  };
}
