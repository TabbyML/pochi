import { vscodeHost } from "@/lib/vscode";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  CircleSlashIcon,
  FileDiffIcon,
  GitCommitHorizontal,
  Loader2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { DataParts } from "@getpochi/livekit";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";

type ActionType = "compare" | "restore";

export const CheckpointUI: React.FC<{
  checkpoint: DataParts["checkpoint"];
  isLoading: boolean;
  className?: string;
  hideBorderOnHover?: boolean;
}> = ({ checkpoint, isLoading, className, hideBorderOnHover = true }) => {
  const { t } = useTranslation();
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
    }) => {
      const actions = {
        compare: () =>
          vscodeHost.showCheckpointDiff("Changes since checkpoint", {
            origin: params.commitId,
          }),
        restore: () => vscodeHost.restoreCheckpoint(params.commitId),
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
    return t("checkpointUI.restore");
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
   * Return the icon on unhover state
   */
  const getIcon = () => {
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
    return <GitCommitHorizontal className="size-5" />;
  };

  return (
    <div
      className={cn(
        "relative w-full opacity-0 transition-opacity duration-200",
        showCheckpoint && "opacity-100",
      )}
    >
      <div
        className={cn(
          "-translate-x-1/2 -top-1 group absolute left-1/2 mx-auto flex min-h-5 w-full max-w-[72px] select-none items-center hover:max-w-full",
          isLoading && "pointer-events-none",
          className,
        )}
      >
        <Border
          hide={isPending || showActionSuccessIcon}
          hideOnHover={hideBorderOnHover}
        />
        <span
          className={cn(
            "flex items-center text-muted-foreground/60 group-hover:px-2.5 group-hover:text-foreground",
            (isPending || showActionSuccessIcon) &&
              "pointer-events-none px-2.5",
          )}
        >
          <span className="hidden group-hover:flex">{getCompareIcon()}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => handleCheckpointAction("compare")}
            className="hidden h-5 items-center gap-1 rounded-md px-1 py-0.5 text-xs hover:bg-transparent group-hover:flex dark:hover:bg-transparent"
          >
            {getCompareText()}
          </Button>

          <span className="hidden group-hover:flex">{getRestoreIcon()}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={() => handleCheckpointAction("restore")}
            className="hidden h-5 items-center gap-1 rounded-md px-1 py-0.5 text-xs hover:bg-transparent group-hover:flex dark:hover:bg-transparent"
          >
            {getRestoreText()}
          </Button>
          <span className="group-hover:hidden">{getIcon()}</span>
        </span>
        <Border
          hide={isPending || showActionSuccessIcon}
          hideOnHover={hideBorderOnHover}
        />
      </div>
    </div>
  );
};

function Border({
  hide,
  hideOnHover,
}: { hide: boolean; hideOnHover?: boolean }) {
  return (
    <div
      className={cn(
        "flex-1 border-border border-t",
        hideOnHover && "group-hover:opacity-0",
        hideOnHover && hide && "opacity-0",
      )}
    />
  );
}
