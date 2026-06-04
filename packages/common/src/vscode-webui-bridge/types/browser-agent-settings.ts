import z from "zod";

const BrowserAgentRuntimeSettings = z.object({
  mode: z.enum(["managed", "localChrome"]),
});

const BrowserAgentLocalChromeSettings = z.object({
  chromePath: z.string(),
  startParams: z.string(),
});

export const BrowserAgentViewportSizes = [
  "1280x720",
  "900x600",
  "768x1024",
  "360x640",
] as const;

const BrowserAgentViewportSettings = z.enum(BrowserAgentViewportSizes);

export type BrowserAgentViewportSettings = z.infer<
  typeof BrowserAgentViewportSettings
>;

export const DefaultBrowserAgentViewport: BrowserAgentViewportSettings =
  "1280x720";

const BrowserAgentManagedBrowserSettings = z.object({
  viewport: BrowserAgentViewportSettings,
});

export const BrowserAgentSettings = z.object({
  runtime: BrowserAgentRuntimeSettings,
  managedBrowser: BrowserAgentManagedBrowserSettings,
  localChrome: BrowserAgentLocalChromeSettings,
});

export type BrowserAgentSettings = z.infer<typeof BrowserAgentSettings>;

export const DefaultRecordingViewport = getBrowserAgentViewportSize(
  DefaultBrowserAgentViewport,
);

export const BrowserAgentSettingsConfig = z.object({
  runtime: BrowserAgentRuntimeSettings.partial().optional(),
  managedBrowser: BrowserAgentManagedBrowserSettings.partial().optional(),
  localChrome: BrowserAgentLocalChromeSettings.partial().optional(),
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
