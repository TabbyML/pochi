import { useEnablePochiModels } from "@/features/settings";
import { vscodeHost } from "@/lib/vscode";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

/** @useSignals this comment is needed to enable signals in this hook */
export const useModelList = (filterPochiModels: boolean) => {
  const { data: modelListSignal, isLoading } = useQuery({
    queryKey: ["modelList"],
    queryFn: fetchModelList,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);

  const enablePochiModels = useEnablePochiModels();

  const modelList = useMemo(() => {
    return filterPochiModels
      ? modelListSignal?.value?.filter((model) => {
          if (model.type === "vendor" && model.vendorId === "pochi") {
            return !model.modelId.startsWith("pochi/") || enablePochiModels;
          }
          return true;
        })
      : modelListSignal?.value;
  }, [filterPochiModels, modelListSignal?.value, enablePochiModels]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await vscodeHost.refreshModelList();
      // The signal will automatically update, so we don't need to call refetch
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  return { modelList, isLoading, isRefreshing, refresh };
};

async function fetchModelList() {
  const signal = threadSignal<DisplayModel[]>(await vscodeHost.readModelList());
  return signal;
}
