import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/** @useSignals */
export const useVSCodeLmModels = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["vscode-lm-models"],
    queryFn: async () => {
      const { models, enabled, enable, disable } =
        await vscodeHost.readVSCodeLm();

      return {
        models: threadSignal(models),
        enabled: threadSignal(enabled),
        enable: enable,
        disable: disable,
      };
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (data === undefined) {
    return {
      models: [],
      isLoading: false,
      enable: () => {},
      disable: () => {},
      enabled: false,
    };
  }

  return {
    models: data.models.value,
    isLoading,
    enable: data.enable,
    disable: data.disable,
    enabled: data.enabled.value,
  };
};
