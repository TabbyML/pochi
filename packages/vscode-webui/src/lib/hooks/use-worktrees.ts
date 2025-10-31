import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/** @useSignals */
export const useWorktrees = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["worktrees"],
    queryFn: fetchWorktrees,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return { data: data?.value, isLoading };
};

async function fetchWorktrees() {
  const result = await vscodeHost.readWorktrees();
  return threadSignal(result);
}
