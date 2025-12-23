import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/**
 * Hook to get user edits
 * Uses ThreadSignal for real-time updates
 */
/** @useSignals */
export const useUserEdits = (checkpointHash: string | null) => {
  const { data: userEditsSignal } = useQuery({
    queryKey: ["userEdits", checkpointHash],
    queryFn: () => fetchUserEdits(checkpointHash),
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (userEditsSignal === undefined) {
    return [];
  }

  return userEditsSignal.value;
};

/**
 * Fetch user edits from workspace API
 */
async function fetchUserEdits(checkpointHash: string | null) {
  return threadSignal(await vscodeHost.readUserEdits(checkpointHash));
}
