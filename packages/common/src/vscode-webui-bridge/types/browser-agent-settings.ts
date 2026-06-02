import z from "zod";

const BrowserAgentRuntimeSettings = z.object({
  mode: z.enum(["managed", "localChrome"]),
});

const BrowserAgentLocalChromeSettings = z.object({
  chromePath: z.string(),
  startParams: z.string(),
});

const BrowserAgentRecordingSettings = z.object({
  recordingEnabled: z.boolean(),
});

export const BrowserAgentViewportSizes = [
  "1280x720",
  "900x600",
  "768x1024",
  "360x640",
] as const;

export const DefaultBrowserAgentViewport = BrowserAgentViewportSizes[0];

const BrowserAgentViewportSettings = z.enum(BrowserAgentViewportSizes);

export type BrowserAgentViewportSettings = z.infer<
  typeof BrowserAgentViewportSettings
>;

const BrowserAgentManagedBrowserSettings = z.object({
  viewport: BrowserAgentViewportSettings,
});

export const BrowserAgentSettings = z.object({
  runtime: BrowserAgentRuntimeSettings,
  managedBrowser: BrowserAgentManagedBrowserSettings,
  localChrome: BrowserAgentLocalChromeSettings,
  recording: BrowserAgentRecordingSettings,
});

export type BrowserAgentSettings = z.infer<typeof BrowserAgentSettings>;

export const DefaultRecordingViewport = getBrowserAgentViewportSize(
  DefaultBrowserAgentViewport,
);

export const BrowserAgentSettingsConfig = z.object({
  runtime: BrowserAgentRuntimeSettings.partial().optional(),
  managedBrowser: BrowserAgentManagedBrowserSettings.partial().optional(),
  localChrome: BrowserAgentLocalChromeSettings.partial().optional(),
  recording: BrowserAgentRecordingSettings.partial().optional(),
});

export type BrowserAgentSettingsConfig = z.infer<
  typeof BrowserAgentSettingsConfig
>;

export type BrowserAgentSettingsUpdate = BrowserAgentSettingsConfig;

export function getBrowserAgentViewportSize(
  viewport: BrowserAgentSettings["managedBrowser"]["viewport"],
) {
  const [width, height] = viewport.split("x").map(Number);
  return {
    width,
    height,
  };
}
