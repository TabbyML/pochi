import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBrowserAgentSettings } from "@/lib/hooks/use-browser-agent-settings";
import {
  type BrowserAgentViewportSettings,
  BrowserAgentViewportSizes,
} from "@getpochi/common/vscode-webui-bridge";
import { createFileRoute } from "@tanstack/react-router";
import type React from "react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/browser-agent-settings")({
  component: () => {
    return (
      <div className="h-screen bg-background">
        <ScrollArea className="h-full">
          <div className="mx-auto grid w-full max-w-3xl gap-5 px-5 py-6">
            <BrowserSettingsSection />
          </div>
        </ScrollArea>
      </div>
    );
  },
});

const DefaultChromePath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DefaultStartParams = "--no-sandbox --disable-dev-shm-usage";
type BrowserMode = "managed" | "localChrome";

export const BrowserSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const { browserSettings: settings, setBrowserSettings } =
    useBrowserAgentSettings();

  if (!settings) {
    return null;
  }

  const isLocalChromeMode = settings.runtime.mode === "localChrome";
  const isManagedBrowserMode = settings.runtime.mode === "managed";

  return (
    <main className="grid gap-5">
      <SettingsSection>
        <div className="grid gap-4">
          <SettingsRow label={t("browserAgentSettings.browserMode")}>
            <div className="grid gap-1.5">
              <Select
                value={settings.runtime.mode}
                onValueChange={(mode: BrowserMode) =>
                  setBrowserSettings({
                    runtime: { mode },
                  })
                }
              >
                <SelectTrigger className="h-9 w-full border-border/80 bg-background shadow-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="managed">
                    {t("browserAgentSettings.managedBrowser")}
                  </SelectItem>
                  <SelectItem value="localChrome">
                    {t("browserAgentSettings.localChrome")}
                  </SelectItem>
                </SelectContent>
              </Select>
              <FieldHint>{t("browserAgentSettings.browserModeHint")}</FieldHint>
            </div>
          </SettingsRow>
          {isManagedBrowserMode && (
            <SettingsRow label={t("browserAgentSettings.viewportSize")}>
              <div className="grid gap-1.5">
                <Select
                  value={settings.managedBrowser.viewport}
                  onValueChange={(viewport: BrowserAgentViewportSettings) => {
                    setBrowserSettings({
                      managedBrowser: {
                        viewport,
                      },
                    });
                  }}
                >
                  <SelectTrigger className="h-9 w-full border-border/80 bg-background shadow-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BrowserAgentViewportSizes.map((size) => (
                      <SelectItem key={size} value={size}>
                        {t(`browserAgentSettings.viewportSizes.${size}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldHint>{t("browserAgentSettings.viewportHint")}</FieldHint>
              </div>
            </SettingsRow>
          )}
          {isLocalChromeMode && (
            <>
              <SettingsRow label={t("browserAgentSettings.chromePath")}>
                <div className="grid gap-1.5">
                  <Input
                    className="h-9 border-border/80 bg-background shadow-sm placeholder:text-muted-foreground/80"
                    value={settings.localChrome.chromePath}
                    placeholder={DefaultChromePath}
                    onChange={(event) =>
                      setBrowserSettings({
                        localChrome: {
                          chromePath: event.target.value,
                        },
                      })
                    }
                  />
                  <FieldHint>
                    {t("browserAgentSettings.chromePathHint")}
                  </FieldHint>
                </div>
              </SettingsRow>
              <SettingsRow label={t("browserAgentSettings.startParams")}>
                <div className="grid gap-1.5">
                  <Input
                    className="h-9 border-border/80 bg-background shadow-sm placeholder:text-muted-foreground/80"
                    value={settings.localChrome.startParams}
                    placeholder={DefaultStartParams}
                    onChange={(event) =>
                      setBrowserSettings({
                        localChrome: {
                          startParams: event.target.value,
                        },
                      })
                    }
                  />
                  <FieldHint>
                    {t("browserAgentSettings.startParamsHint")}
                  </FieldHint>
                </div>
              </SettingsRow>
            </>
          )}
        </div>
      </SettingsSection>
    </main>
  );
};

function SettingsSection({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-border/70 border-t pt-5 first:border-t-0 first:pt-0">
      {children}
    </section>
  );
}

function SettingsRow({
  label,
  labelFor,
  children,
}: {
  label: string;
  labelFor?: string;
  children: React.ReactNode;
}) {
  const labelClassName = "font-semibold text-base text-foreground";
  const labelNode = labelFor ? (
    <label htmlFor={labelFor} className={labelClassName}>
      {label}
    </label>
  ) : (
    <span className={labelClassName}>{label}</span>
  );

  return (
    <div className="grid gap-1.5">
      {labelNode}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground text-sm leading-5">{children}</p>;
}
