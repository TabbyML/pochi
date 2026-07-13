import { vscodeHost } from "@/lib/vscode";
import { useQuery } from "@tanstack/react-query";

/**
 * Reads the global effective context window (in tokens) used to cap
 * auto-compaction. Returns undefined when not configured, in which case the
 * built-in default is used.
 */
export const useEffectiveContextWindow = (): number | undefined => {
  const { data } = useQuery({
    queryKey: ["effectiveContextWindow"],
    queryFn: () => vscodeHost.readEffectiveContextWindow(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  return data ?? undefined;
};
