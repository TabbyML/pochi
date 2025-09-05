import { vscodeHost } from "@/lib/vscode";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useSettingsStore } from "src/features/settings/store";

/** @useSignals this comment is needed to enable signals in this hook */
export const useModelList = (applyFilter: boolean) => {
  const { data: modelListSignal, isLoading } = useQuery({
    queryKey: ["modelList"],
    queryFn: fetchModelList,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const { enablePochiModels, enableVSCodeLm } = useSettingsStore();

  const modelList = applyFilter
    ? modelListSignal?.value?.filter((model) => {
        if (model.type === "vendor" && model.vendorId === "pochi") {
          return !model.modelId.startsWith("pochi/") || enablePochiModels;
        }
        if (model.type === "vendor" && model.vendorId === "vscode-lm") {
          return enableVSCodeLm;
        }
        return true;
      })
    : modelListSignal?.value;

  return { modelList, isLoading };
};

async function fetchModelList() {
  const signal = threadSignal<DisplayModel[]>(await vscodeHost.readModelList());
  return signal;
}
