import { vscodeHost } from "@/lib/vscode";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";

/**
 * Reads the global effective context window (in tokens) used to cap
 * auto-compaction. Returns undefined when not configured, in which case the
 * built-in default is used.
 *
 * The value is backed by a signal, so the hook re-renders whenever the
 * configuration changes.
 *
 * @useSignals this comment is needed to enable signals in this hook
 */
export const useEffectiveContextWindow = (): number | undefined => {
  const { data } = useQuery({
    queryKey: ["effectiveContextWindow"],
    queryFn: () => fetchEffectiveContextWindow(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  return data?.value.value ?? undefined;
};

async function fetchEffectiveContextWindow() {
  const result = await vscodeHost.readEffectiveContextWindow();
  return {
    value: threadSignal(result),
  };
}
