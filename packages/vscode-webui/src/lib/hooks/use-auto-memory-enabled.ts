import { vscodeHost } from "@/lib/vscode";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

/** @useSignals this comment is needed to enable signals in this hook */
export const useAutoMemoryEnabled = () => {
  const { data } = useQuery({
    queryKey: ["autoMemoryEnabled"],
    queryFn: () => fetchAutoMemoryEnabled(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const [overrideDisabled, setOverrideDisabled] = useState(false);

  const globalEnabled = data?.value.value ?? true;
  return {
    autoMemoryEnabled: globalEnabled && !overrideDisabled,
    setAutoMemoryEnabled: data
      ? (enabled: boolean) => setOverrideDisabled(!enabled)
      : undefined,
  };
};

async function fetchAutoMemoryEnabled() {
  const result = await vscodeHost.readAutoMemoryEnabled();
  return {
    value: threadSignal(result.value),
    setAutoMemoryEnabled: result.setAutoMemoryEnabled,
  };
}
