import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Blocks,
  Eye,
  FileEdit,
  type LucideIcon,
  RotateCcw,
  Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type AutoApprove, useSettingsStore } from "../store";

interface CoreActionSetting {
  id: keyof Omit<AutoApprove, "default">;
  label: string;
  iconClass: LucideIcon;
  summary: string;
}

export function AutoApproveMenu() {
  const { t } = useTranslation();
  const {
    autoApproveActive,
    updateAutoApproveActive,
    autoApproveSettings,
    updateAutoApproveSettings,
  } = useSettingsStore();

  const [currentMaxRetry, setCurrentMaxRetry] = useState(
    autoApproveSettings.maxRetryLimit.toString(),
  );

  useEffect(() => {
    setCurrentMaxRetry(autoApproveSettings.maxRetryLimit.toString());
  }, [autoApproveSettings.maxRetryLimit]);

  const coreActionSettings: CoreActionSetting[] = [
    {
      id: "read",
      summary: t("settings.autoApprove.read"),
      label: t("settings.autoApprove.readFiles"),
      iconClass: Eye,
    },
    {
      id: "write",
      summary: t("settings.autoApprove.write"),
      label: t("settings.autoApprove.writeFiles"),
      iconClass: FileEdit,
    },
    {
      id: "execute",
      summary: t("settings.autoApprove.execute"),
      label: t("settings.autoApprove.executeCommands"),
      iconClass: Terminal,
    },
    {
      id: "mcp",
      summary: t("settings.autoApprove.mcp"),
      label: t("settings.autoApprove.useMcpServers"),
      iconClass: Blocks,
    },
  ];

  const handleCoreActionToggle = (
    id: keyof Omit<AutoApprove, "default">,
    checked: boolean,
  ) => {
    updateAutoApproveSettings({ [id]: checked });
  };

  const handleRetryLimitChange = (value: string) => {
    setCurrentMaxRetry(value);
    const numValue = Number.parseInt(value, 10);
    if (!Number.isNaN(numValue) && numValue >= 1 && numValue <= 10) {
      updateAutoApproveSettings({ maxRetryLimit: numValue });
    }
  };

  const handleRetryLimitBlur = () => {
    setCurrentMaxRetry(autoApproveSettings.maxRetryLimit.toString());
  };

  const getCoreActionCheckedState = (
    id: keyof Omit<AutoApprove, "default">,
  ): boolean => {
    return !!autoApproveSettings[id];
  };

  const enabledOptionsSummary = [
    ...coreActionSettings
      .filter((setting) => getCoreActionCheckedState(setting.id))
      .map((setting) => setting.summary),
    ...(autoApproveSettings.retry ? [t("settings.autoApprove.retry")] : []),
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <div
          className={cn(
            "relative mt-2 flex cursor-pointer select-none items-center justify-between py-2.5",
          )}
        >
          <div className="flex w-full overflow-x-hidden">
            <label
              htmlFor="auto-approve-main-checkbox-trigger-dialog"
              className="flex shrink-0 cursor-pointer items-center pr-3 pl-1"
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                id="auto-approve-main-checkbox-trigger-dialog"
                checked={autoApproveActive}
                onCheckedChange={(checked) => {
                  updateAutoApproveActive(!!checked);
                }}
              />
            </label>
            <div className="flex flex-1 flex-nowrap items-center gap-1 overflow-hidden font-medium hover:text-foreground/80">
              <div className="flex-1 truncate">
                <span className="whitespace-nowrap">
                  {t("settings.autoApprove.title")}:
                </span>
                {autoApproveActive && enabledOptionsSummary.length > 0 ? (
                  <span className="ml-1">
                    {enabledOptionsSummary.join(", ")}
                  </span>
                ) : (
                  <span className="ml-1 text-[var(--vscode-descriptionForeground)]">
                    {autoApproveActive
                      ? t("settings.autoApprove.noActionsSelected")
                      : t("settings.autoApprove.disabled")}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="grid grid-cols-1 gap-2.5 [@media(min-width:400px)]:w-[400px] [@media(min-width:400px)]:grid-cols-2"
        side="top"
      >
        {coreActionSettings.map((setting) => (
          <div key={setting.id} className="flex items-center">
            <label
              htmlFor={`core-action-dialog-${setting.id}`}
              className={
                "flex flex-1 cursor-pointer select-none items-center pl-1 text-foreground text-sm"
              }
            >
              <Checkbox
                id={`core-action-dialog-${setting.id}`}
                checked={getCoreActionCheckedState(setting.id)}
                onCheckedChange={(checked) =>
                  handleCoreActionToggle(setting.id, !!checked)
                }
              />
              <span className="ml-4 flex items-center gap-2 font-semibold">
                <setting.iconClass className="size-4 shrink-0" />
                {setting.label}
              </span>
            </label>
          </div>
        ))}

        {/* Max Attempts Section - Always visible */}
        <div className="mt-1 border-gray-200/30 border-t pt-2 [@media(min-width:400px)]:col-span-2">
          <div className="flex h-7 items-center pl-1">
            <Checkbox
              id="retry-actions-trigger-dialog"
              checked={autoApproveSettings.retry}
              onCheckedChange={(checked) =>
                handleCoreActionToggle("retry", !!checked)
              }
            />
            <label
              className="flex cursor-pointer items-center gap-3 px-3"
              htmlFor={
                autoApproveSettings.retry
                  ? "retry-actions-max-attempts"
                  : "retry-actions-trigger-dialog"
              }
            >
              <span className="ml-1.5 flex items-center gap-2 font-semibold">
                <RotateCcw className="size-4 shrink-0" />
                <span className="whitespace-nowrap text-foreground text-sm">
                  {autoApproveSettings.retry
                    ? `${t("settings.autoApprove.maxAttempts")}:`
                    : t("settings.autoApprove.retryActions")}
                </span>
              </span>
            </label>
            {autoApproveSettings.retry && (
              <Input
                id="retry-actions-max-attempts"
                type="number"
                min="1"
                max="10"
                value={currentMaxRetry}
                onChange={(e) => handleRetryLimitChange(e.target.value)}
                onBlur={handleRetryLimitBlur}
                className="h-7 w-full text-xs [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
