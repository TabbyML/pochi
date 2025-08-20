import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/** @useSignals */
export const useVSCodeLmModels = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["vscode-lm-models"],
    queryFn: async () => {
      const { models, enabled, toggle } = await vscodeHost.readVSCodeLm();

      return {
        models: threadSignal(models),
        enabled: threadSignal(enabled),
        toggle: toggle,
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
    };
  }

  return {
    models: data.models.value,
    isLoading,
    toggle: data.toggle,
    enabled: data.enabled.value,
  };
};
