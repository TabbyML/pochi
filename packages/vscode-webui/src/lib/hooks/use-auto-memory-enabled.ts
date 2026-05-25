import { vscodeHost } from "@/lib/vscode";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

/** @useSignals this comment is needed to enable signals in this hook */
export const useAutoMemoryEnabled = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["autoMemoryEnabled"],
    queryFn: () => fetchAutoMemoryEnabled(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  return {
    autoMemoryEnabled: data?.value.value ?? true,
    setAutoMemoryEnabled: data?.setAutoMemoryEnabled,
    isLoading,
  };
};

async function fetchAutoMemoryEnabled() {
  const result = await vscodeHost.readAutoMemoryEnabled();
  return {
    value: threadSignal(result.value),
    setAutoMemoryEnabled: result.setAutoMemoryEnabled,
  };
}
