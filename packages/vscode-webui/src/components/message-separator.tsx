import { vscodeHost } from "@/lib/vscode";
import { useMutation } from "@tanstack/react-query";
import { Check, GitBranchPlus, Loader2, SquareChartGantt } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn, formatExecutionDuration } from "@/lib/utils";
import { prompts } from "@getpochi/common";
import type { TextUIPart } from "ai";
import { useState } from "react";
import { Button } from "./ui/button";

const ActionButtonClassName =
  "h-5 items-center gap-1 rounded-md px-1 py-0.5 text-xs hover:bg-transparent dark:hover:bg-transparent";

function openCompactSummary(compactPart: TextUIPart, messageId: string) {
  const parsed = prompts.parseInlineCompact(compactPart.text);
  if (parsed) {
    vscodeHost.openFile(`/task-summary-${messageId}.md`, {
      base64Data: btoa(unescape(encodeURIComponent(parsed.summary))),
    });
  }
}

/**
 * The separator between two messages, with a Fork action that is revealed on
 * hover. When the next message starts with a compaction, its summary can be
 * opened from here too.
 */
export const MessageSeparator: React.FC<{
  isLoading: boolean;
  onFork: () => Promise<void>;
  compactPart?: TextUIPart;
  compactMessageId?: string;
  executionDuration?: number;
}> = ({
  isLoading,
  onFork,
  compactPart,
  compactMessageId,
  executionDuration,
}) => {
  const { t } = useTranslation();
  const [showSuccessIcon, setShowSuccessIcon] = useState(false);

  const { mutate: fork, isPending } = useMutation({
    mutationFn: async () => {
      await Promise.all([
        onFork(),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    },
    onSuccess: () => {
      setShowSuccessIcon(true);
      setTimeout(() => setShowSuccessIcon(false), 2000);
    },
  });

  const handleFork = () => {
    if (isLoading || isPending) return;
    fork();
  };

  const successIcon = (
    <Check className="size-4 text-emerald-700 dark:text-emerald-300" />
  );

  const getForkIcon = () => {
    if (isPending) return <Loader2 className="size-3 animate-spin" />;
    if (showSuccessIcon) return successIcon;
    return <GitBranchPlus className="size-3" />;
  };

  const getForkText = () => {
    if (isPending) return t("messageSeparator.forking");
    if (showSuccessIcon) return t("messageSeparator.success");
    return t("messageSeparator.fork");
  };

  // The label shown while the separator is not hovered.
  const getNormalStateLabel = () => {
    if (isPending) return <Loader2 className="size-3 animate-spin" />;
    if (showSuccessIcon) return successIcon;
    if (compactPart) return <SquareChartGantt className="size-3" />;
    if (executionDuration) {
      return (
        <span>
          {t("messageList.completedIn", {
            duration: formatExecutionDuration(executionDuration),
          })}
        </span>
      );
    }
    return <GitBranchPlus className="size-3" />;
  };

  const forkControl = (
    <span className="flex items-center">
      {getForkIcon()}
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={handleFork}
        className={ActionButtonClassName}
        aria-label={t("messageSeparator.fork")}
      >
        {getForkText()}
      </Button>
    </span>
  );

  const summaryControl = compactPart && compactMessageId && (
    <span className="flex items-center">
      <SquareChartGantt className="size-3" />
      <Button
        size="sm"
        variant="ghost"
        className={ActionButtonClassName}
        onClick={() => openCompactSummary(compactPart, compactMessageId)}
      >
        {t("messageSeparator.summary")}
      </Button>
    </span>
  );

  // The action under the cursor after hover-expansion matches the collapsed
  // icon: the summary glyph maps to Summary, otherwise to Fork. Side actions
  // live inside the flex-1 border tracks so the center anchor never shifts.
  const centerControl = summaryControl || forkControl;
  const sideControl = summaryControl ? forkControl : null;
  const actionsDisabled = isPending || showSuccessIcon;

  return (
    <div className="relative w-full">
      <div
        data-testid="message-separator"
        className={cn(
          "-translate-x-1/2 -top-1 group absolute left-1/2 mx-auto flex min-h-5 w-full max-w-full select-none items-center",
          isLoading && "pointer-events-none",
        )}
      >
        {isLoading ? (
          // While streaming, keep only the separator line.
          <div className="w-full border-border border-t" />
        ) : (
          <>
            <div className="flex-1 border-border border-t" />
            <span
              className={cn(
                "flex items-center text-muted-foreground/60 group-hover:px-1 group-hover:text-foreground",
                // The duration label has its own padding; icons need a small
                // gap from the border lines.
                !(executionDuration && !compactPart) && "px-1",
                actionsDisabled && "pointer-events-none px-2.5",
              )}
            >
              <span className="hidden items-center group-hover:flex">
                {centerControl}
              </span>
              <span
                className={cn(
                  "group-hover:hidden",
                  executionDuration && !compactPart && "px-2 text-xs",
                )}
              >
                {getNormalStateLabel()}
              </span>
            </span>
            <div className="flex flex-1 items-center justify-start">
              {sideControl && (
                <span
                  className={cn(
                    "hidden items-center gap-1 pr-2.5 text-foreground group-hover:flex",
                    actionsDisabled && "pointer-events-none",
                  )}
                >
                  {sideControl}
                </span>
              )}
              <div className="flex-1 border-border border-t" />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * The separator for a compaction, with a Summary action that is revealed on
 * hover.
 */
export const CompactSummarySeparator: React.FC<{
  compactPart: TextUIPart;
  messageId: string;
  className?: string;
}> = ({ compactPart, messageId, className }) => {
  const { t } = useTranslation();

  return (
    <div className={cn("relative w-full", className)}>
      <div className="-translate-x-1/2 -top-1 group absolute left-1/2 mx-auto flex min-h-5 w-full max-w-[72px] select-none items-center hover:max-w-full">
        <div className="flex-1 border-border border-t group-hover:opacity-0" />
        <span className="flex items-center px-1 text-muted-foreground/60 group-hover:px-2.5 group-hover:text-foreground">
          <span className="hidden group-hover:flex">
            <SquareChartGantt className="size-3" />
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-[1px] hidden h-5 items-center gap-1 rounded-md px-1 py-0.5 text-xs hover:bg-transparent group-hover:flex dark:hover:bg-transparent"
            onClick={() => openCompactSummary(compactPart, messageId)}
          >
            {t("messageSeparator.summary")}
          </Button>
          <span className="group-hover:hidden">
            <SquareChartGantt className="size-3" />
          </span>
        </span>
        <div className="flex-1 border-border border-t group-hover:opacity-0" />
      </div>
    </div>
  );
};
