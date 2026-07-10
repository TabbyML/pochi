import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FileList } from "@/features/tools";
import { cn } from "@/lib/utils";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAutoMemoryEnabled } from "@/lib/hooks/use-auto-memory-enabled";
import { useRules } from "@/lib/hooks/use-rules";
import { useTaskContextWindowUsage } from "@/lib/hooks/use-task-context-window-usage";
import { useTaskMemoryState } from "@/lib/hooks/use-task-memory-state";
import { vscodeAutoMemoryManager, vscodeHost } from "@/lib/vscode";
import { constants, TaskMemoryFileUri } from "@getpochi/common";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import { getAutoCompactThreshold } from "@getpochi/livekit";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Progress } from "./ui/progress";

interface Props {
  taskId: string;
  selectedModel: DisplayModel;
  totalTokens: number;
  className?: string;
  compact?: {
    inlineCompactTaskPending: boolean;
    inlineCompactTask: () => void;
    newCompactTaskPending: boolean;
    newCompactTask: () => void;
    enabled: boolean;
  };
}

export function TokenUsage({
  taskId,
  totalTokens,
  className,
  compact,
  selectedModel,
}: Props) {
  const { contextWindowUsage } = useTaskContextWindowUsage(taskId);
  const { taskMemoryState } = useTaskMemoryState(taskId);
  const hasTaskMemory = taskMemoryState.extractionCount > 0;
  const { autoMemoryEnabled, setAutoMemoryEnabled } = useAutoMemoryEnabled();
  const { data: autoMemoryContext } = useQuery({
    queryKey: ["autoMemoryContext"],
    queryFn: async () =>
      vscodeAutoMemoryManager.readContext({
        ensure: false,
        force: true,
      }),
    staleTime: 5_000,
  });
  const autoMemoryAvailable = Boolean(autoMemoryContext);

  const handleOpenAutoMemory = async () => {
    const context = await vscodeAutoMemoryManager.readContext({
      ensure: true,
      force: true,
    });
    if (context?.indexPath) {
      vscodeHost.openFile(context.indexPath);
      setIsOpen(false);
    }
  };

  const handleClearProjectMemory = async () => {
    const confirmed = await vscodeHost.showInformationMessage(
      t("tokenUsage.projectMemoryClear"),
      { modal: true, detail: t("tokenUsage.projectMemoryClearConfirm") },
      t("tokenUsage.projectMemoryClear"),
    );
    if (!confirmed) return;
    await vscodeAutoMemoryManager.clearProjectMemory();
    setIsOpen(false);
  };
  const { t } = useTranslation();
  const contextWindow =
    selectedModel.options.contextWindow || constants.DefaultContextWindow;
  const percentage = Math.ceil((totalTokens / contextWindow) * 100);
  const autoCompactThreshold = getAutoCompactThreshold(
    contextWindow,
    selectedModel.options.effectiveContextWindow,
  );
  const autoCompactPct = (autoCompactThreshold / contextWindow) * 100;
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const { rules } = useRules();

  const handleMouseEnter = () => {
    if (!isPinned) {
      setIsOpen(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isPinned) {
      setIsOpen(false);
    }
  };

  const handleClick = () => {
    if (isPinned) {
      setIsPinned(false);
      setIsOpen(false);
    } else {
      setTimeout(() => {
        setIsPinned(true);
        setIsOpen(true);
      }, 0);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // If popover is closing for any reason, it should be unpinned
      setIsPinned(false);
    }
  };

  const minTokenTooltip =
    totalTokens < constants.CompactTaskMinTokens ? (
      <TooltipContent>
        <p>
          {t("tokenUsage.minTokensRequired", {
            minTokens: constants.CompactTaskMinTokens,
          })}
        </p>
      </TooltipContent>
    ) : null;

  const getPct = (value: number | undefined) => {
    if (!value || !contextWindowUsage) return 0;

    const breakdownTotal =
      (contextWindowUsage.system ?? 0) +
      (contextWindowUsage.tools ?? 0) +
      (contextWindowUsage.messages ?? 0) +
      (contextWindowUsage.files ?? 0) +
      (contextWindowUsage.toolResults ?? 0) +
      (contextWindowUsage.projectMemory ?? 0);

    if (breakdownTotal === 0) return 0;

    return (value / breakdownTotal) * percentage;
  };

  const systemVal = getPct(contextWindowUsage?.system);
  const toolsVal = getPct(contextWindowUsage?.tools);
  const messagesVal = getPct(contextWindowUsage?.messages);
  const filesVal = getPct(contextWindowUsage?.files);
  const toolResultsVal = getPct(contextWindowUsage?.toolResults);
  const projectMemoryVal = getPct(contextWindowUsage?.projectMemory);

  const showSystemSection =
    !!contextWindowUsage && (systemVal > 0.05 || toolsVal > 0.05);
  const showUserContextSection =
    !!contextWindowUsage &&
    (messagesVal > 0.05 || filesVal > 0.05 || toolResultsVal > 0.05);

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        asChild
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      >
        <div
          className={cn(
            "cursor-pointer overflow-x-hidden rounded-md px-2 py-1 text-muted-foreground text-xs hover:bg-muted hover:text-foreground",
            className,
          )}
        >
          <span className="flex select-none items-center gap-1 whitespace-nowrap font-medium">
            {compact?.newCompactTaskPending ||
            compact?.inlineCompactTaskPending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("tokenUsage.compacting")}
              </>
            ) : (
              `${percentage}${t("tokenUsage.ofTokens", { tokens: formatTokens(contextWindow) })}`
            )}
          </span>
        </div>
      </PopoverTrigger>
      <PopoverContent
        className="w-85 border"
        sideOffset={0}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col gap-y-4 text-xs">
          {/* Section: Context Window */}
          <div className="flex flex-col gap-y-1">
            <div className="mb-1 flex items-center gap-1 font-medium text-foreground">
              <span>{t("tokenUsage.contextWindow")}</span>
              {selectedModel.type === "provider" &&
                selectedModel.options.contextWindow === undefined && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href="command:pochi.openCustomModelSettings"
                          className="inline-flex cursor-pointer items-center"
                          rel="noopener noreferrer"
                        >
                          <CircleAlert className="size-3.5 text-muted-foreground" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs">
                          {t("tokenUsage.defaultContextWindowWarning")}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
            </div>
            <div className="mb-2 flex items-center justify-between text-muted-foreground">
              <span>
                {t("tokenUsage.tokensUsed", {
                  used: formatTokens(totalTokens),
                  total: formatTokens(contextWindow),
                })}
              </span>
              <span className="font-semibold text-foreground">
                {percentage}%
              </span>
            </div>
            <div className="relative mb-3">
              <Progress value={percentage} />
              {autoCompactThreshold > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="group -translate-x-1/2 -inset-y-0.5 absolute flex w-3 cursor-default justify-center"
                        style={{ left: `${autoCompactPct}%` }}
                      >
                        <div className="h-full w-[3px] rounded-full bg-muted-foreground/60 transition-all duration-150 group-hover:scale-x-125 group-hover:bg-foreground/90" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>
                        {t("tokenUsage.autoCompactAt", {
                          tokens: formatTokens(autoCompactThreshold),
                        })}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>

            <div className="mt-1 flex flex-col gap-y-3">
              {showSystemSection && (
                <div className="flex flex-col gap-y-1.5">
                  <div className="font-medium text-foreground">
                    {t("tokenUsage.system")}
                  </div>
                  {systemVal > 0.05 && (
                    <div className="ml-3 flex justify-between text-muted-foreground">
                      <span>{t("tokenUsage.systemInstructions")}</span>
                      <span>{formatPercentage(systemVal)}</span>
                    </div>
                  )}
                  {toolsVal > 0.05 && (
                    <div className="ml-3 flex justify-between text-muted-foreground">
                      <span>{t("tokenUsage.toolDefinitions")}</span>
                      <span>{formatPercentage(toolsVal)}</span>
                    </div>
                  )}
                </div>
              )}

              {showUserContextSection && (
                <div className="flex flex-col gap-y-1.5">
                  <div className="font-medium text-foreground">
                    {t("tokenUsage.userContext")}
                  </div>
                  {messagesVal > 0.05 && (
                    <div className="ml-3 flex justify-between text-muted-foreground">
                      <span>{t("tokenUsage.messages")}</span>
                      <span>{formatPercentage(messagesVal)}</span>
                    </div>
                  )}
                  {filesVal > 0.05 && (
                    <div className="ml-3 flex justify-between text-muted-foreground">
                      <span>{t("tokenUsage.files")}</span>
                      <span>{formatPercentage(filesVal)}</span>
                    </div>
                  )}
                  {toolResultsVal > 0.05 && (
                    <div className="ml-3 flex justify-between text-muted-foreground">
                      <span>{t("tokenUsage.toolResults")}</span>
                      <span>{formatPercentage(toolResultsVal)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Memory sub-section: same style as System / User Context */}
              <div className="flex flex-col gap-y-1.5">
                <div className="font-medium text-foreground">
                  {t("tokenUsage.memory")}
                </div>

                {/* Project Memory row (label + toggle on the left, percentage on the right) */}
                <div className="group/project-memory ml-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="cursor-pointer text-left text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              void handleOpenAutoMemory();
                            }}
                          >
                            {t("tokenUsage.projectMemory")}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[260px]">
                          <div className="flex flex-col gap-1">
                            <div className="font-medium">
                              {t("tokenUsage.projectMemory")}
                            </div>
                            <div className="text-muted-foreground">
                              {t("tokenUsage.projectMemoryDescription")}
                            </div>
                            {!autoMemoryAvailable && (
                              <div className="text-muted-foreground italic">
                                {t("tokenUsage.projectMemoryUnavailable")}
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <label
                            htmlFor="project-memory-enabled"
                            className={cn(
                              "inline-flex select-none items-center",
                              setAutoMemoryEnabled
                                ? "cursor-pointer"
                                : "cursor-not-allowed",
                            )}
                          >
                            <Checkbox
                              id="project-memory-enabled"
                              aria-label={
                                autoMemoryEnabled
                                  ? t("tokenUsage.projectMemoryDisable")
                                  : t("tokenUsage.projectMemoryEnable")
                              }
                              checked={autoMemoryEnabled}
                              disabled={!setAutoMemoryEnabled}
                              onCheckedChange={(checked) =>
                                setAutoMemoryEnabled?.(checked === true)
                              }
                              className="data-[state=checked]:!border-[var(--vscode-focusBorder)] data-[state=checked]:!bg-[var(--vscode-focusBorder)] data-[state=checked]:!text-[var(--vscode-button-foreground)] size-3.5 [&_svg]:size-2.5"
                            />
                          </label>
                        </TooltipTrigger>
                        <TooltipContent>
                          {autoMemoryEnabled
                            ? t("tokenUsage.projectMemoryDisable")
                            : t("tokenUsage.projectMemoryEnable")}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {autoMemoryAvailable && (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={t("tokenUsage.projectMemoryClear")}
                        className="invisible h-auto px-1.5 py-0.5 text-xs group-hover/project-memory:visible"
                        onClick={() => {
                          void handleClearProjectMemory();
                        }}
                      >
                        {t("tokenUsage.projectMemoryReset")}
                      </Button>
                    )}
                    {autoMemoryAvailable && (
                      <span className="text-muted-foreground">
                        {formatPercentage(projectMemoryVal)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Task Memory row (mirrors Project Memory row structure so the tooltip anchors at the same position) */}
                <div className="ml-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="cursor-pointer text-left text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              vscodeHost.openFile(TaskMemoryFileUri);
                              setIsOpen(false);
                            }}
                          >
                            {t("tokenUsage.taskMemory")}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[260px]">
                          <div className="flex flex-col gap-1">
                            <div className="font-medium">
                              {t("tokenUsage.taskMemory")}
                            </div>
                            <div className="text-muted-foreground">
                              {t("tokenUsage.taskMemoryDescription")}
                            </div>
                            {!hasTaskMemory && (
                              <div className="text-muted-foreground italic">
                                {t("tokenUsage.taskMemoryUnavailable")}
                              </div>
                            )}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section: Rules */}
          {rules?.length > 0 && (
            <div className="flex flex-col gap-y-1">
              <div className="font-medium text-foreground">
                {t("tokenUsage.rules")}
              </div>
              <div>
                <FileList
                  matches={rules.map((item) => ({
                    file: item.relativeFilepath ?? item.filepath,
                    label: item.label,
                  }))}
                  showBaseName={false}
                />
              </div>
            </div>
          )}

          {/* Section: Compact */}
          <div className="flex flex-col gap-y-2">
            <div className="font-medium text-foreground">
              {t("tokenUsage.compact")}
            </div>
            <div className="flex flex-nowrap items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-block">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          compact?.newCompactTask();
                          setIsOpen(false);
                        }}
                        disabled={!compact?.enabled}
                      >
                        {compact?.newCompactTaskPending
                          ? t("tokenUsage.compacting")
                          : t("tokenUsage.newTaskWithSummary")}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {minTokenTooltip}
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-block">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        onClick={() => {
                          compact?.inlineCompactTask();
                          setIsOpen(false);
                        }}
                        disabled={!compact?.enabled}
                      >
                        {compact?.inlineCompactTaskPending
                          ? t("tokenUsage.compacting")
                          : t("tokenUsage.compactTask")}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  {minTokenTooltip}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatPercentage(value: number): string {
  const rounded = value.toFixed(1);
  if (value > 0 && rounded === "0.0") {
    return "<0.1%";
  }
  return `${rounded}%`;
}

function formatTokens(tokens: number | null | undefined): string {
  if (tokens == null || tokens === 0) {
    return "0";
  }
  const k = 1000;
  const m = k * 1000;
  const g = m * 1000;
  // Add T, P, E if needed

  let value: number;
  let unit: string;

  if (tokens >= g) {
    value = tokens / g;
    unit = "G";
  } else if (tokens >= m) {
    value = tokens / m;
    unit = "M";
  } else if (tokens >= k) {
    value = tokens / k;
    unit = "k";
  } else {
    return tokens.toString(); // Return the number as is if less than 1k
  }

  // Format to one decimal place
  let formattedValue = value.toFixed(1);

  // If it ends with .0, remove .0
  if (formattedValue.endsWith(".0")) {
    formattedValue = formattedValue.substring(0, formattedValue.length - 2);
  }

  return `${formattedValue}${unit}`;
}
