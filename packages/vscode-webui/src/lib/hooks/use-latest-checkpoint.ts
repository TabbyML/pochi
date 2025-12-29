import { vscodeHost } from "@/lib/vscode";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

/** @useSignals */
export const useLatestCheckpoint = () => {
  const { data: latestCheckpointSignal } = useQuery({
    queryKey: ["latestCheckpoint"],
    queryFn: fetchLatestCheckpoint,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (latestCheckpointSignal === undefined) {
    return null;
  }

  return latestCheckpointSignal.value;
};

async function fetchLatestCheckpoint() {
  return threadSignal(await vscodeHost.readLatestCheckpoint());
}
