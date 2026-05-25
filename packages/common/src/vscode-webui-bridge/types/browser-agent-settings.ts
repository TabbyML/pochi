import z from "zod";

export const BrowserAgentRecordingSizeOptions = [
  "1280x720",
  "1138x640",
  "854x480",
] as const;

export const BrowserAgentRecordingSize = z.enum(
  BrowserAgentRecordingSizeOptions,
);

export type BrowserAgentRecordingSize = z.infer<
  typeof BrowserAgentRecordingSize
>;

export function parseBrowserAgentRecordingSize(
  size: BrowserAgentRecordingSize,
) {
  const [width, height] = size.split("x").map(Number);
  return { width, height };
}

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

export type BrowserAgentSettingsUpdate = BrowserAgentSettingsConfig;
