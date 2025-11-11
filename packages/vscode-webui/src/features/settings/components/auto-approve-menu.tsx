import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  Blocks,
  CheckIcon,
  Eye,
  FileEdit,
  type LucideIcon,
  RotateCcw,
  SquareChevronRightIcon,
  Terminal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAutoApprove } from "../hooks/use-auto-approve";
import { useSubtaskOffhand } from "../hooks/use-subtask-offhand";
import { type AutoApprove, GlobalStateStorage } from "../store";

interface CoreActionSetting {
  id: keyof Omit<AutoApprove, "default">;
  label: string;
  iconClass: LucideIcon;
  summary: string;
}

export function AutoApproveMenu({ isSubTask }: { isSubTask: boolean }) {
  const { t } = useTranslation();
  const {
    autoApproveActive,
    updateAutoApproveActive,
    autoApproveSettings,
    updateAutoApproveSettings,
  } = useAutoApprove({ isSubTask });

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

  const [isSaving, setIsSaving] = useState(false);

  const handlePersistSettings = async () => {
    if (isSaving) return;
    setIsSaving(true);
    await GlobalStateStorage.persist({
      autoApproveActive,
      autoApproveSettings,
      subtaskOffhand,
    });
    setTimeout(() => {
      setIsSaving(false);
      setIsDirty(false);
      // After persisting, the current state is the new "initial" state
      setInitialSettings({
        autoApproveActive,
        autoApproveSettings,
        subtaskOffhand,
      });
    }, 1000);
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

  const { subtaskOffhand, toggleSubtaskOffhand } = useSubtaskOffhand();

  const [isDirty, setIsDirty] = useState(false);
  type SettingsSnapshot = {
    autoApproveActive: boolean;
    autoApproveSettings: AutoApprove;
    subtaskOffhand: boolean;
  };
  const [initialSettings, setInitialSettings] =
    useState<SettingsSnapshot | null>(null);

  useEffect(() => {
    if (isSubTask || !initialSettings) return;

    const currentSnapshot = {
      autoApproveActive,
      autoApproveSettings,
      subtaskOffhand,
    };
    const hasChanges =
      JSON.stringify(currentSnapshot) !== JSON.stringify(initialSettings);
    setIsDirty(hasChanges);
  }, [
    autoApproveActive,
    autoApproveSettings,
    subtaskOffhand,
    initialSettings,
    isSubTask,
  ]);

  const onOpenChange = (open: boolean) => {
    if (isSubTask) return;

    if (open) {
      setInitialSettings({
        autoApproveActive,
        autoApproveSettings,
        subtaskOffhand,
      });
    } else {
      // When closing, just reset dirty tracking. Unsaved changes remain in the store.
      setInitialSettings(null);
      setIsDirty(false);
    }
  };

  return (
    <Popover onOpenChange={onOpenChange}>
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
        className="[@media(min-width:400px)]:w-[400px]"
        side="top"
      >
        {isDirty && !isSubTask && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handlePersistSettings}
            disabled={isSaving}
            className="mb-3"
          >
            {isSaving ? (
              <CheckIcon className="size-4" />
            ) : (
              t("settings.autoApprove.applyChangesToDefault")
            )}
          </Button>
        )}
        <div className="grid grid-cols-1 gap-2.5 [@media(min-width:400px)]:grid-cols-2">
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
                <span className="ml-3.5 flex items-center gap-2 font-semibold">
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

            {!isSubTask && (
              <div className="mt-1 flex h-7 items-center">
                <Switch
                  id="subtask-toggle-offhand"
                  checked={subtaskOffhand}
                  onCheckedChange={toggleSubtaskOffhand}
                />
                <label
                  className="flex cursor-pointer items-center gap-3 px-3"
                  htmlFor={"subtask-toggle-offhand"}
                >
                  <span className="ml-1.5 flex items-center gap-2 font-semibold">
                    <SquareChevronRightIcon className="size-4 shrink-0" />
                    <span className="whitespace-nowrap text-foreground text-sm">
                      {subtaskOffhand
                        ? t("settings.autoApprove.subtaskOffhand")
                        : t("settings.autoApprove.subtaskManual")}
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
