import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/** @useSignals */
export const useVSCodeLmModels = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["vscode-lm-models"],
    queryFn: async () => {
      const { models, enabled, toggle, featureAvailable } =
        await vscodeHost.readVSCodeLm();

      return {
        models: threadSignal(models),
        enabled: threadSignal(enabled),
        toggle: toggle,
        featureAvailable,
      };
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (data === undefined) {
    return {
      models: [],
      isLoading: false,
      toggle: () => {},
      enabled: false,
      featureAvailable: false,
    };
  }

  return {
    models: data.models.value,
    isLoading,
    toggle: data.toggle,
    enabled: data.enabled.value,
    featureAvailable: data.featureAvailable,
  };
};
