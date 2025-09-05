import { vscodeHost } from "@/lib/vscode";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

/** @useSignals this comment is needed to enable signals in this hook */
export const useModelList = () => {
  const { data: modelListSignal, isLoading } = useQuery({
    queryKey: ["modelList"],
    queryFn: fetchModelList,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (modelListSignal === undefined) {
    return { modelList: undefined, isLoading };
  }

  return { modelList: modelListSignal.value, isLoading };
};

async function fetchModelList() {
  const signal = threadSignal<DisplayModel[]>(await vscodeHost.readModelList());
  return signal;
}
