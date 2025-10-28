import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/** @useSignals */
export const useWorktrees = () => {
  const { data } = useQuery({
    queryKey: ["worktrees"],
    queryFn: fetchWorktrees,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return data?.value;
};

async function fetchWorktrees() {
  const result = await vscodeHost.readWorktrees();
  return threadSignal(result);
}
