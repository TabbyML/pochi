import { z } from "zod";

export const PochiWebviewSettingsStorageName = "ragdoll-settings-storage";

export const BrowserAgentRecordingSize = z.enum([
  "1280x720",
  "1138x640",
  "854x480",
]);

export type BrowserAgentRecordingSize = z.infer<
  typeof BrowserAgentRecordingSize
>;

const BrowserAgentRuntimeSettings = z.object({
  mode: z.enum(["managed", "localChrome"]),
});

const BrowserAgentLocalChromeSettings = z.object({
  chromePath: z.string(),
  startParams: z.string(),
});

const BrowserAgentRecordingSettings = z.object({
  recordingEnabled: z.boolean(),
  recordingSize: BrowserAgentRecordingSize,
});

export const BrowserAgentSettings = z.object({
  runtime: BrowserAgentRuntimeSettings,
  localChrome: BrowserAgentLocalChromeSettings,
  recording: BrowserAgentRecordingSettings,
});

export type BrowserAgentSettings = z.infer<typeof BrowserAgentSettings>;

export const BrowserAgentSettingsConfig = z.object({
  runtime: BrowserAgentRuntimeSettings.partial().optional(),
  localChrome: BrowserAgentLocalChromeSettings.partial().optional(),
  recording: BrowserAgentRecordingSettings.partial().optional(),
});

export type BrowserAgentSettingsConfig = z.infer<
  typeof BrowserAgentSettingsConfig
>;

export type BrowserAgentSettingsUpdate = {
  runtime?: Partial<BrowserAgentSettings["runtime"]>;
  localChrome?: Partial<BrowserAgentSettings["localChrome"]>;
  recording?: Partial<BrowserAgentSettings["recording"]>;
};

export const DefaultBrowserAgentSettings: BrowserAgentSettings = {
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
): BrowserAgentSettings {
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

export const PochiWebviewSettings = z.looseObject({
  browserAgentSettings: BrowserAgentSettings,
});

export type PochiWebviewSettings = z.infer<typeof PochiWebviewSettings>;
