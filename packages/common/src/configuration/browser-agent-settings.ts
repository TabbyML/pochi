import type {
  BrowserAgentSettingsConfig,
  BrowserAgentSettings as BrowserAgentSettingsValue,
} from "../vscode-webui-bridge/types/browser-agent-settings";

export const DefaultBrowserAgentSettings: BrowserAgentSettingsValue = {
  runtime: {
    mode: "managed",
  },
  localChrome: {
    chromePath: "",
    startParams: "",
  },
  recording: {
    recordingEnabled: true,
    recordingSize: "1138x640",
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
    localChrome: {
      ...DefaultBrowserAgentSettings.localChrome,
      ...current?.localChrome,
      ...settings?.localChrome,
    },
    recording: {
      ...DefaultBrowserAgentSettings.recording,
      ...current?.recording,
      ...settings?.recording,
    },
  };
}
