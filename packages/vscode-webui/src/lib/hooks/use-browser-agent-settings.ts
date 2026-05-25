import {
  type BrowserAgentSettingsUpdate,
  DefaultBrowserAgentSettings,
} from "@getpochi/common/vscode-webui-bridge";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { vscodeHost } from "../vscode";

/** @useSignals */
export function useBrowserAgentSettings() {
  const { data } = useQuery({
    queryKey: ["browserAgentSettings"],
    queryFn: async () => {
      const browserAgentSettings = await vscodeHost.readBrowserAgentSettings();
      return {
        browserSettings: threadSignal(browserAgentSettings.browserSettings),
        updateBrowserAgentSettings:
          browserAgentSettings.updateBrowserAgentSettings,
      };
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  const setBrowserSettings = useCallback(
    async (settings: BrowserAgentSettingsUpdate) => {
      await data?.updateBrowserAgentSettings(settings);
    },
    [data],
  );

  return {
    browserSettings: data?.browserSettings.value ?? DefaultBrowserAgentSettings,
    setBrowserSettings,
  };
}
