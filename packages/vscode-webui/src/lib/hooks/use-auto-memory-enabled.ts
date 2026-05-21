import { vscodeHost } from "@/lib/vscode";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

/**
 * Hook to read and toggle the long-term (auto) memory setting.
 *
 * Auto memory is enabled by default. Reads a reactive thread-signal from
 * the VS Code host and exposes a setter that persists the choice to
 * `pochi.advanced.memory.enabled`, mirroring the
 * `useAutoMemoryState` / `useTaskMemoryState` hook pattern.
 *
 * @useSignals this comment is needed to enable signals in this hook
 */
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
