import type {
  BrowserAgentSettingsConfig,
  BrowserAgentSettings as BrowserAgentSettingsValue,
} from "../vscode-webui-bridge/types/browser-agent-settings";
import { DefaultBrowserAgentViewport } from "../vscode-webui-bridge/types/browser-agent-settings";

export const DefaultBrowserAgentSettings: BrowserAgentSettingsValue = {
  runtime: {
    mode: "managed",
  },
  managedBrowser: {
    viewport: DefaultBrowserAgentViewport,
  },
  localChrome: {
    chromePath: "",
    startParams: "",
  },
};

export function mergeBrowserAgentSettings(
  settings?: BrowserAgentSettingsConfig | null,
  current?: BrowserAgentSettingsConfig | null,
): BrowserAgentSettingsValue {
  return {
    runtime: {
      ...DefaultBrowserAgentSettings.runtime,
      ...current?.runtime,
      ...settings?.runtime,
    },
    managedBrowser: {
      ...DefaultBrowserAgentSettings.managedBrowser,
      ...current?.managedBrowser,
      ...settings?.managedBrowser,
    },
    localChrome: {
      ...DefaultBrowserAgentSettings.localChrome,
      ...current?.localChrome,
      ...settings?.localChrome,
    },
  };
}
