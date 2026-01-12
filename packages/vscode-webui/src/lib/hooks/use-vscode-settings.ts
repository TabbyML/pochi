import type { VSCodeSettings } from "@getpochi/common/vscode-webui-bridge";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/** @useSignals this comment is needed to enable signals in this hook */
export const useVSCodeSettings = () => {
  const { data: vscodeSettingsSignal } = useQuery({
    queryKey: ["vscodeSettings"],
    queryFn: fetchVSCodeSettings,
    staleTime: Number.POSITIVE_INFINITY,
  });

  return (
    vscodeSettingsSignal?.value ??
    ({
      hideRecommendSettings: true,
      autoSaveDisabled: true,
      commentsOpenViewDisabled: true,
      githubCopilotCodeCompletionEnabled: false,
    } as VSCodeSettings)
  );
};

async function fetchVSCodeSettings() {
  const signal = threadSignal(await vscodeHost.readVSCodeSettings());
  return signal;
}
