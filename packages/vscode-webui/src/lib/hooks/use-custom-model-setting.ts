import { vscodeHost } from "@/lib/vscode";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

/** @useSignals this comment is needed to enable signals in this hook */
export const useCustomModelSetting = () => {
  const { data: customModelSettingsSignal, isLoading } = useQuery({
    queryKey: ["customModelSetting"],
    queryFn: fetchCustomModelSetting,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (customModelSettingsSignal === undefined) {
    return { customModelSettings: undefined, isLoading };
  }

  return { customModelSettings: customModelSettingsSignal.value, isLoading };
};

async function fetchCustomModelSetting() {
  const signal = threadSignal(await vscodeHost.readCustomModelSetting());
  return signal;
}
