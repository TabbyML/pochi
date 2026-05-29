import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useBrowserAgentSettings } from "@/lib/hooks/use-browser-agent-settings";
import { cn } from "@/lib/utils";
import {
  type BrowserAgentRecordingSize,
  BrowserAgentRecordingSizeOptions,
  parseBrowserAgentRecordingSize,
} from "@getpochi/common/vscode-webui-bridge";
import type { CheckedState } from "@radix-ui/react-checkbox";
import { createFileRoute } from "@tanstack/react-router";
import { Check, ChevronDown } from "lucide-react";
import type React from "react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/browser-agent-settings")({
  component: () => {
    return (
      <div className="h-screen bg-background">
        <ScrollArea className="h-full">
          <div className="mx-auto grid w-full max-w-4xl gap-6 px-6 py-7">
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

const RecordingSizeOptions: {
  value: BrowserAgentRecordingSize;
  label: string;
}[] = BrowserAgentRecordingSizeOptions.map((value) => {
  const { width, height } = parseBrowserAgentRecordingSize(value);
  return {
    value,
    label: `${width} x ${height}`,
  };
});

export const BrowserSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const { browserSettings: settings, setBrowserSettings } =
    useBrowserAgentSettings();

  if (!settings) {
    return null;
  }

  const isLocalChromeMode = settings.runtime.mode === "localChrome";

  return (
    <main className="grid gap-5">
      <SettingsSection title={t("browserAgentSettings.recordingSection")}>
        <div className="grid gap-4">
          <label
            htmlFor="browser-agent-recording-enabled"
            className="flex min-h-9 items-center gap-3 font-medium text-muted-foreground text-sm"
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
          <SettingsRow label={t("browserAgentSettings.recordingSize")}>
            <RecordingSizeSelect
              value={settings.recording.recordingSize}
              onChange={(recordingSize) =>
                setBrowserSettings({
                  recording: {
                    recordingSize,
                  },
                })
              }
            />
          </SettingsRow>
        </div>
      </SettingsSection>

      <SettingsSection title={t("browserAgentSettings.runtimeSection")}>
        <SettingsRow label={t("browserAgentSettings.browserMode")}>
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
        </SettingsRow>
        {isLocalChromeMode && (
          <div className="grid gap-3 border-border/70 border-t pt-4">
            <h3 className="font-medium text-sm tracking-normal">
              {t("browserAgentSettings.localChromeSection")}
            </h3>
            <p className="text-muted-foreground text-xs leading-5">
              {t("browserAgentSettings.localChromeHint")}
            </p>
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
                <p className="text-muted-foreground text-xs">
                  {t("browserAgentSettings.chromePathHint")}
                </p>
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
                <p className="text-muted-foreground text-xs">
                  {t("browserAgentSettings.startParamsHint")}
                </p>
              </div>
            </SettingsRow>
          </div>
        )}
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
    <section className="grid gap-3 border-border/70 border-t pt-5 first:border-t-0 first:pt-0">
      <h2 className="font-semibold text-base tracking-normal">{title}</h2>
      {children}
    </section>
  );
}

function SettingsRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="font-medium text-muted-foreground text-sm">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function RecordingSizeSelect({
  value,
  onChange,
}: {
  value: BrowserAgentRecordingSize;
  onChange: (value: BrowserAgentRecordingSize) => void;
}) {
  const selectedOption =
    RecordingSizeOptions.find((option) => option.value === value) ??
    RecordingSizeOptions[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between rounded-md border border-border/80 bg-background px-3 text-sm shadow-sm outline-none transition-[color,box-shadow] hover:bg-muted focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span>{selectedOption.label}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[var(--radix-dropdown-menu-trigger-width)]"
      >
        {RecordingSizeOptions.map((option) => {
          const isSelected = option.value === value;
          return (
            <DropdownMenuItem
              key={option.value}
              className="justify-between"
              onSelect={() => onChange(option.value)}
            >
              {option.label}
              {isSelected && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
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
    <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-background p-1 shadow-sm">
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
