import { useEnablePochiModels } from "@/features/settings";
import { vscodeHost } from "@/lib/vscode";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

/** @useSignals this comment is needed to enable signals in this hook */
export const useModelList = (filterPochiModels: boolean) => {
  const { data, isLoading } = useQuery({
    queryKey: ["modelList"],
    queryFn: fetchModelList,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const enablePochiModels = useEnablePochiModels();

  const modelList = useMemo(() => {
    return filterPochiModels
      ? data?.modelList?.value?.filter((model) => {
          if (model.type === "vendor" && model.vendorId === "pochi") {
            return !model.modelId.startsWith("pochi/") || enablePochiModels;
          }
          return true;
        })
      : data?.modelList?.value;
  }, [filterPochiModels, data?.modelList?.value, enablePochiModels]);

  return {
    modelList,
    isLoading,
    isFetching: !!data?.isLoading.value,
    reload: data?.reload,
  };
};

async function fetchModelList() {
  const result = await vscodeHost.readModelList();
  return {
    modelList: threadSignal(result.modelList),
    isLoading: threadSignal(result.isLoading),
    reload: result.reload,
  };
}
