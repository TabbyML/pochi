import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/** @useSignals */
export const useVSCodeModels = () => {
  const { data: vscodeModelsSignal } = useQuery({
    queryKey: ["vscodeModels"],
    queryFn: fetchVSCodeModels,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (vscodeModelsSignal === undefined) {
    return [];
  }

  return vscodeModelsSignal.value;
};

async function fetchVSCodeModels() {
  const signal = threadSignal(await vscodeHost.readVSCodeModels());
  return signal;
}
