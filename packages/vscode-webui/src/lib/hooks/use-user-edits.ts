import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/**
 * Hook to get user edits
 * Uses ThreadSignal for real-time updates
 */
/** @useSignals */
export const useUserEdits = (uid: string | undefined | null) => {
  const { data: userEditsSignal } = useQuery({
    queryKey: ["userEdits", uid],
    queryFn: () => fetchUserEdits(uid),
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
async function fetchUserEdits(uid: string | null | undefined) {
  if (!uid) return;

  return threadSignal(await vscodeHost.readUserEdits(uid));
}
