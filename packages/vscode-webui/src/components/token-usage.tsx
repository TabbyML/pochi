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
import { useRules } from "@/lib/hooks/use-rules";
import { useTaskContextWindowUsage } from "@/lib/hooks/use-task-context-window-usage";
import { constants } from "@getpochi/common";
import type { DisplayModel } from "@getpochi/common/vscode-webui-bridge";
import { CircleAlert, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";
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
  const { t } = useTranslation();
  const contextWindow =
    selectedModel.options.contextWindow || constants.DefaultContextWindow;
  const percentage = Math.ceil((totalTokens / contextWindow) * 100);
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

    // Sum up the total tokens from the breakdown
    const breakdownTotal =
      contextWindowUsage.system +
      contextWindowUsage.tools +
      contextWindowUsage.messages +
      contextWindowUsage.files +
      contextWindowUsage.toolResults;

    if (breakdownTotal === 0) return 0;

    return (value / breakdownTotal) * percentage;
  };

  const systemVal = getPct(contextWindowUsage?.system);
  const toolsVal = getPct(contextWindowUsage?.tools);
  const messagesVal = getPct(contextWindowUsage?.messages);
  const filesVal = getPct(contextWindowUsage?.files);
  const toolResultsVal = getPct(contextWindowUsage?.toolResults);

  const showSystemSection = systemVal > 0.05 || toolsVal > 0.05;
  const showUserContextSection =
    messagesVal > 0.05 || filesVal > 0.05 || toolResultsVal > 0.05;
  const showBreakdown =
    contextWindowUsage && (showSystemSection || showUserContextSection);

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
        className="w-80 border"
        sideOffset={0}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex flex-col gap-y-4 text-xs">
          {rules?.length > 0 && (
            <div className="flex flex-col gap-y-1">
              <div className="mb-1 text-muted-foreground">
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
            <div className="mb-2 text-muted-foreground">
              {t("tokenUsage.tokensUsed", {
                used: formatTokens(totalTokens),
                total: formatTokens(contextWindow),
                percentage,
              })}
            </div>
            <Progress value={percentage} className="mb-3" />

            {showBreakdown && (
              <div className="mt-1 flex flex-col gap-y-3">
                {showSystemSection && (
                  <div className="flex flex-col gap-y-1.5">
                    <div className="font-medium text-foreground">
                      {t("tokenUsage.system")}
                    </div>
                    {systemVal > 0.05 && (
                      <div className="ml-3 flex justify-between text-muted-foreground">
                        <span>{t("tokenUsage.systemInstructions")}</span>
                        <span>{systemVal.toFixed(1)}%</span>
                      </div>
                    )}
                    {toolsVal > 0.05 && (
                      <div className="ml-3 flex justify-between text-muted-foreground">
                        <span>{t("tokenUsage.toolDefinitions")}</span>
                        <span>{toolsVal.toFixed(1)}%</span>
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
                        <span>{messagesVal.toFixed(1)}%</span>
                      </div>
                    )}
                    {filesVal > 0.05 && (
                      <div className="ml-3 flex justify-between text-muted-foreground">
                        <span>{t("tokenUsage.files")}</span>
                        <span>{filesVal.toFixed(1)}%</span>
                      </div>
                    )}
                    {toolResultsVal > 0.05 && (
                      <div className="ml-3 flex justify-between text-muted-foreground">
                        <span>{t("tokenUsage.toolResults")}</span>
                        <span>{toolResultsVal.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="mt-2 flex items-center gap-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-block">
                    <Button
                      variant="secondary"
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
                      variant="secondary"
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
      </PopoverContent>
    </Popover>
  );
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
