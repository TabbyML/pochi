import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/** @useSignals */
export const useVSCodeLmModels = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["vscode-lm-models"],
    queryFn: async () => {
      const { models, featureAvailable } = await vscodeHost.readVSCodeLm();

      return {
        models: threadSignal(models),
        featureAvailable,
      };
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (data === undefined) {
    return {
      models: [],
      isLoading: false,
      featureAvailable: false,
    };
  }

  return {
    models: data.models.value,
    isLoading,
    featureAvailable: data.featureAvailable,
  };
};
