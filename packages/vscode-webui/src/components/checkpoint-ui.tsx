import { vscodeHost } from "@/lib/vscode";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  CircleSlashIcon,
  FileDiffIcon,
  GitBranchPlus,
  GitCommitHorizontal,
  Loader2,
  SquareChartGantt,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { useIsDevMode } from "@/features/settings";
import { cn, formatExecutionDuration } from "@/lib/utils";
import { prompts } from "@getpochi/common";
import type { DataParts } from "@getpochi/livekit";
import type { TextUIPart } from "ai";
import { useState } from "react";
import { Button } from "./ui/button";

type ActionType = "compare" | "restore" | "fork";

export const CheckpointUI: React.FC<{
  checkpoint: DataParts["checkpoint"];
  isLoading: boolean;
  className?: string;
  hideBorderOnHover?: boolean;
  forkTask?: (commitId: string, messageId?: string) => Promise<void>;
  restoreMessageId?: string;
  isRestored?: boolean;
  compactPart?: TextUIPart;
  compactMessageId?: string;
  executionDuration?: number;
}> = ({
  checkpoint,
  isLoading,
  className,
  hideBorderOnHover = true,
  forkTask,
  restoreMessageId,
  isRestored,
  compactPart,
  compactMessageId,
  executionDuration,
}) => {
  const { t } = useTranslation();
  const [isDevMode] = useIsDevMode();
  const [currentAction, setCurrentAction] = useState<ActionType>();
  const [showActionSuccessIcon, setShowActionSuccessIcon] = useState(false);

  const {
    mutate: executeAction,
    isPending,
    data: actionResult,
  } = useMutation({
    mutationFn: async (params: {
      action: ActionType;
      commitId: string;
      messageId?: string;
    }) => {
      const actions = {
        compare: () =>
          vscodeHost.showCheckpointDiff("Changes since checkpoint", {
            origin: params.commitId,
          }),
        restore: () => vscodeHost.restoreCheckpoint(params.commitId),
        fork: async () => {
          if (forkTask) {
            await forkTask(params.commitId, params.messageId);
          }
        },
      };

      const results = await Promise.all([
        actions[params.action](),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);

      return results[0];
    },
    onSuccess: () => {
      setShowActionSuccessIcon(true);
      setTimeout(() => {
        setShowActionSuccessIcon(false);
        setCurrentAction(undefined);
      }, 2000);
    },
  });

  const handleCheckpointAction = (action: ActionType) => {
    if (isLoading || isPending) return;
    setCurrentAction(action);
    executeAction({
      action,
      commitId: checkpoint.commit,
      messageId: restoreMessageId,
    });
  };

  const showCheckpoint = checkpoint?.commit;

  const getRestoreIcon = () => {
    if (isPending && currentAction === "restore") {
      return <Loader2 className="size-3 animate-spin" />;
    }
    if (showActionSuccessIcon && currentAction === "restore") {
      return (
        <Check className="size-4 text-emerald-700 dark:text-emerald-300" />
      );
    }
    return <GitCommitHorizontal className="size-5" />;
  };

  const getRestoreText = () => {
    if (isPending && currentAction === "restore") {
      return t("checkpointUI.restoring");
    }
    if (showActionSuccessIcon && currentAction === "restore") {
      return t("checkpointUI.success");
    }
    if (isRestored) {
      return t("checkpointUI.restored");
    }
    return t("checkpointUI.restore");
  };

  const getForkIcon = () => {
    if (isPending && currentAction === "fork") {
      return <Loader2 className="size-3 animate-spin" />;
    }
    if (showActionSuccessIcon && currentAction === "fork") {
      return (
        <Check className="size-4 text-emerald-700 dark:text-emerald-300" />
      );
    }
    return <GitBranchPlus className="size-3" />;
  };

  const getForkText = () => {
    if (isPending && currentAction === "fork") {
      return t("checkpointUI.forking");
    }
    if (showActionSuccessIcon && currentAction === "fork") {
      return t("checkpointUI.success");
    }
    return t("checkpointUI.fork");
  };

  const getCompareIcon = () => {
    if (isPending && currentAction === "compare") {
      return <Loader2 className="size-3 animate-spin" />;
    }
    if (showActionSuccessIcon && currentAction === "compare") {
      return actionResult === true ? (
        <Check className="size-4 text-emerald-700 dark:text-emerald-300" />
      ) : (
        <CircleSlashIcon className="size-3" />
      );
    }
    return <FileDiffIcon className="size-3" />;
  };

  const getCompareText = () => {
    if (isPending && currentAction === "compare") {
      return t("checkpointUI.opening");
    }
    if (showActionSuccessIcon && currentAction === "compare") {
      return actionResult === true
        ? t("checkpointUI.success")
        : t("checkpointUI.noChangesDetected");
    }
    return t("checkpointUI.compare");
  };

  /**
   * Return the label for normal (non-hover) state
   */
  const getNormalStateLabel = () => {
    if (isPending) {
      return <Loader2 className="size-3 animate-spin" />;
    }
    if (showActionSuccessIcon) {
      if (currentAction === "compare" && actionResult !== true) {
        return <CircleSlashIcon className="size-3" />;
      }
      return (
        <Check className="size-4 text-emerald-700 dark:text-emerald-300" />
      );
    }
    if (compactPart) {
      return <SquareChartGantt className="size-3" />;
    }
    if (executionDuration) {
      const label = t("messageList.completedIn", {
        duration: formatExecutionDuration(executionDuration),
      });
      return <span>{label}</span>;
    }
    return <GitCommitHorizontal className="size-5" />;
  };

  const handleOpenSummary = () => {
    if (!compactPart) return;
    const parsed = prompts.parseInlineCompact(compactPart.text);
    if (parsed && compactMessageId) {
      vscodeHost.openFile(`/task-summary-${compactMessageId}.md`, {
        base64Data: btoa(unescape(encodeURIComponent(parsed.summary))),
      });
    }
  };

  const actionButtonClassName =
    "h-5 items-center gap-1 rounded-md px-1 py-0.5 text-xs hover:bg-transparent dark:hover:bg-transparent";

  const compareControl = (
    <span className="flex items-center">
      {getCompareIcon()}
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => handleCheckpointAction("compare")}
        className={actionButtonClassName}
      >
        {getCompareText()}
      </Button>
    </span>
  );

  const restoreControl = (
    <span className="flex items-center">
      <span className={cn("flex", isRestored && "text-current/40")}>
        {getRestoreIcon()}
      </span>
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending || isRestored}
        onClick={() => handleCheckpointAction("restore")}
        className={actionButtonClassName}
      >
        {getRestoreText()} {isDevMode && `(${checkpoint.commit})`}
      </Button>
    </span>
  );

  const forkControl = forkTask && (
    <span className="flex items-center">
      {getForkIcon()}
      <Button
        size="sm"
        variant="ghost"
        disabled={isPending}
        onClick={() => handleCheckpointAction("fork")}
        className={actionButtonClassName}
      >
        {getForkText()}
      </Button>
    </span>
  );

  const summaryControl = compactPart && (
    <span className="flex items-center">
      <SquareChartGantt className="size-3" />
      <Button
        size="sm"
        variant="ghost"
        className={actionButtonClassName}
        onClick={handleOpenSummary}
      >
        {t("checkpointUI.summary")}
      </Button>
    </span>
  );

  // The action under the cursor after hover-expansion must match the
  // collapsed icon: with a summary the collapsed icon is the summary
  // glyph, so Summary stays centered; otherwise the commit glyph maps
  // to Restore. Side actions live inside the flex-1 border tracks so
  // the center anchor never shifts.
  const centerControl = compactPart ? summaryControl : restoreControl;
  const actionsDisabled = isPending || showActionSuccessIcon;

  return (
    <div
      className={cn(
        "relative w-full opacity-0 transition-opacity duration-200",
        showCheckpoint && "opacity-100",
      )}
    >
      <div
        className={cn(
          "-translate-x-1/2 -top-1 group absolute left-1/2 mx-auto flex min-h-5 w-full select-none items-center hover:max-w-full",
          executionDuration && !compactPart ? "max-w-[140px]" : "max-w-[72px]",
          isLoading && "pointer-events-none",
          className,
        )}
      >
        <div className="flex flex-1 items-center justify-end">
          <Border
            hide={isPending || showActionSuccessIcon}
            hideOnHover={hideBorderOnHover}
            isRestored={isRestored}
          />
          <span
            className={cn(
              "hidden items-center gap-1 pl-2.5 text-foreground group-hover:flex",
              actionsDisabled && "pointer-events-none",
            )}
          >
            {compareControl}
            {compactPart && restoreControl}
          </span>
        </div>
        <span
          className={cn(
            "flex items-center text-muted-foreground/60 group-hover:px-1 group-hover:text-foreground",
            // The compact icon (size-3) is smaller than the git-commit icon
            // (size-5), so it needs a tiny symmetric gap from the border lines
            // when unhovered. The git-commit icon stays flush.
            compactPart && "px-1",
            actionsDisabled && "pointer-events-none px-2.5",
          )}
        >
          <span className="hidden items-center group-hover:flex">
            {centerControl}
          </span>
          <span
            className={cn(
              "group-hover:hidden",
              isRestored && "text-primary/60",
              executionDuration && !compactPart && "px-2 text-xs",
            )}
          >
            {getNormalStateLabel()}
          </span>
        </span>
        <div className="flex flex-1 items-center justify-start">
          <span
            className={cn(
              "hidden items-center gap-1 pr-2.5 text-foreground group-hover:flex",
              actionsDisabled && "pointer-events-none",
            )}
          >
            {forkControl}
          </span>
          <Border
            hide={isPending || showActionSuccessIcon}
            hideOnHover={hideBorderOnHover}
            isRestored={isRestored}
          />
        </div>
      </div>
    </div>
  );
};

function Border({
  hide,
  hideOnHover,
  isRestored,
}: {
  hide: boolean;
  hideOnHover?: boolean;
  isRestored?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex-1 border-border border-t",
        hideOnHover && "group-hover:opacity-0",
        hideOnHover && hide && "opacity-0",
        isRestored && "border-primary/60",
      )}
    />
  );
}

export const CompactCheckpointUI: React.FC<{
  compactPart: TextUIPart;
  messageId: string;
  className?: string;
}> = ({ compactPart, messageId, className }) => {
  const { t } = useTranslation();

  const handleOpenSummary = () => {
    const parsed = prompts.parseInlineCompact(compactPart.text);
    if (parsed) {
      vscodeHost.openFile(`/task-summary-${messageId}.md`, {
        base64Data: btoa(unescape(encodeURIComponent(parsed.summary))),
      });
    }
  };

  return (
    <div className={cn("relative w-full", className)}>
      <div className="-translate-x-1/2 -top-1 group absolute left-1/2 mx-auto flex min-h-5 w-full max-w-[72px] select-none items-center hover:max-w-full">
        <Border hide={false} hideOnHover />
        <span className="flex items-center px-1 text-muted-foreground/60 group-hover:px-2.5 group-hover:text-foreground">
          <span className="hidden group-hover:flex">
            <SquareChartGantt className="size-3" />
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="ml-[1px] hidden h-5 items-center gap-1 rounded-md px-1 py-0.5 text-xs hover:bg-transparent group-hover:flex dark:hover:bg-transparent"
            onClick={handleOpenSummary}
          >
            {t("checkpointUI.summary")}
          </Button>
          <span className="group-hover:hidden">
            <SquareChartGantt className="size-3" />
          </span>
        </span>
        <Border hide={false} hideOnHover />
      </div>
    </div>
  );
};
