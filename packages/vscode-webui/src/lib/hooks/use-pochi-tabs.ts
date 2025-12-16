import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/**
 * Hook to get pochi tasks state
 * Uses ThreadSignal for real-time updates
 */
/** @useSignals */
export const usePochiTabs = () => {
  const { data: pochiTabsSignal } = useQuery({
    queryKey: ["pochiTabs"],
    queryFn: fetchPochiTabs,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (pochiTabsSignal === undefined) {
    return {};
  }

  return pochiTabsSignal.value;
};

/**
 * Fetch pochi tabs from workspace API
 */
async function fetchPochiTabs() {
  return threadSignal(await vscodeHost.readPochiTabs());
}
