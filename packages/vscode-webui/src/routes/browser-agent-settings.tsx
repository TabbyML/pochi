import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBrowserAgentSettings } from "@/lib/hooks/use-browser-agent-settings";
import { cn } from "@/lib/utils";
import {
  type BrowserAgentViewportSettings,
  BrowserAgentViewportSizes,
} from "@getpochi/common/vscode-webui-bridge";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { createFileRoute } from "@tanstack/react-router";
import { CheckIcon, ChevronDown } from "lucide-react";
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
      <SettingsSection title={t("browserAgentSettings.runtimeSection")}>
        <div className="grid gap-4">
          <SettingsRow label={t("browserAgentSettings.browserMode")}>
            <div className="grid gap-1.5">
              <SegmentedControl
                value={settings.runtime.mode}
                options={[
                  {
                    value: "managed",
                    label: t("browserAgentSettings.managedBrowser"),
                  },
                  {
                    value: "localChrome",
                    label: t("browserAgentSettings.localChrome"),
                  },
                ]}
                onChange={(mode) =>
                  setBrowserSettings({
                    runtime: { mode },
                  })
                }
              />
              <FieldHint>{t("browserAgentSettings.browserModeHint")}</FieldHint>
            </div>
          </SettingsRow>
          {isManagedBrowserMode && (
            <SettingsSubsection
              title={t("browserAgentSettings.managedBrowserSection")}
            >
              <SettingsRow label={t("browserAgentSettings.viewportSize")}>
                <div className="grid gap-1.5">
                  <DropdownSelectControl
                    value={settings.managedBrowser.viewport}
                    options={BrowserAgentViewportSizes.map((size) => ({
                      value: size,
                      label: t(`browserAgentSettings.viewportSizes.${size}`),
                    }))}
                    onChange={(viewport: BrowserAgentViewportSettings) => {
                      setBrowserSettings({
                        managedBrowser: {
                          viewport,
                        },
                      });
                    }}
                  />
                  <FieldHint>
                    {t("browserAgentSettings.viewportHint")}
                  </FieldHint>
                </div>
              </SettingsRow>
            </SettingsSubsection>
          )}
          {isLocalChromeMode && (
            <SettingsSubsection
              title={t("browserAgentSettings.localChromeSection")}
            >
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
            </SettingsSubsection>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title={t("browserAgentSettings.recordingSection")}>
        <div className="grid gap-4">
          <label
            htmlFor="browser-agent-recording-enabled"
            className="flex min-h-9 items-center gap-2.5 font-medium text-foreground text-sm"
          >
            <Checkbox
              id="browser-agent-recording-enabled"
              checked={settings.recording.recordingEnabled}
              onCheckedChange={(checked: CheckedState) =>
                setBrowserSettings({
                  recording: {
                    recordingEnabled: checked === true,
                  },
                })
              }
            />
            <span>{t("browserAgentSettings.enableRecording")}</span>
          </label>
        </div>
      </SettingsSection>
    </main>
  );
};

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 border-border/70 border-t pt-5 first:border-t-0 first:pt-0">
      <div className="flex min-h-7 items-center">
        <h2 className="font-semibold text-base text-foreground tracking-normal">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function SettingsSubsection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-4 rounded-md border border-border/70 bg-background/60 p-4">
      <div className="flex min-h-6 items-center">
        <h3 className="font-semibold text-foreground text-sm tracking-normal">
          {title}
        </h3>
      </div>
      {description && <FieldHint>{description}</FieldHint>}
      <div className="grid gap-3.5">{children}</div>
    </div>
  );
}

function SettingsRow({
  label,
  labelFor,
  density = "default",
  children,
}: {
  label: string;
  labelFor?: string;
  density?: "default" | "compact";
  children: React.ReactNode;
}) {
  const labelClassName = cn(
    "font-medium text-muted-foreground",
    density === "compact" ? "text-xs" : "text-sm",
  );
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
  return <p className="text-muted-foreground text-xs leading-5">{children}</p>;
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-1 rounded-md border border-border bg-background p-1 shadow-sm">
      {options.map((option) => {
        const isSelected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            className={cn(
              "h-8 rounded-[calc(theme(borderRadius.md)-2px)] px-3 text-sm transition-colors",
              isSelected
                ? "bg-primary font-semibold text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function DropdownSelectControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 w-full justify-between border-border/80 bg-background px-3 font-normal text-sm shadow-sm"
        >
          <span className="truncate">
            {selectedOption?.label ?? options[0]?.label}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)]"
      >
        <DropdownMenuRadioGroup value={value}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                className="cursor-pointer pl-2"
                onClick={(event) => {
                  onChange(option.value);
                  event.stopPropagation();
                }}
              >
                <CheckIcon
                  className={cn(
                    "mr-2 size-4 shrink-0",
                    isSelected ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className={cn(isSelected && "font-semibold")}>
                  {option.label}
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
