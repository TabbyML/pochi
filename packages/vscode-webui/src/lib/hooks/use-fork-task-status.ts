import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/** @useSignals this comment is needed to enable signals in this hook */
export const useForkTaskStatus = (): Record<string, "inProgress" | "ready"> => {
  const { data: forkTaskStatus } = useQuery({
    queryKey: ["forkTaskStatus"],
    queryFn: fetchForkTaskStatus,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return forkTaskStatus?.value || {};
};

async function fetchForkTaskStatus() {
  const signal = threadSignal((await vscodeHost.readForkTaskStatus()).status);
  return signal;
}
