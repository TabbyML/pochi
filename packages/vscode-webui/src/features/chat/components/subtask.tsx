import { Button, buttonVariants } from "@/components/ui/button";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { vscodeHost } from "@/lib/vscode";
import { catalog } from "@getpochi/livekit";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { type MouseEvent, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { SubtaskInfo } from "../hooks/use-subtask-info";

export const SubtaskHeader: React.FC<{
  subtask: SubtaskInfo;
  className?: string;
}> = ({ subtask, className }) => {
  const { t } = useTranslation();
  const store = useDefaultStore();
  const parentTask = store.useQuery(
    catalog.queries.makeTaskQuery(subtask.parentUid),
  );
  const subtaskTask = store.useQuery(
    catalog.queries.makeTaskQuery(subtask.uid),
  );
  const runAsync = subtaskTask?.runAsync;
  const parentCwd = parentTask?.cwd;
  const handleBack = useCallback(
    (event: MouseEvent) => {
      // Async tasks (runAsync=true) need VS Code API to switch panes, sync tasks use React Router
      if (runAsync && parentCwd) {
        event.preventDefault();
        vscodeHost.openTaskInPanel({
          type: "open-task",
          uid: subtask.parentUid,
          cwd: parentCwd,
          storeId: store.storeId,
        });
      }
      // Sync tasks (runAsync=false/undefined) or missing parentCwd use React Router navigation
    },
    [parentCwd, store.storeId, subtask.parentUid, runAsync],
  );

  return (
    <div className={cn("px-2 pb-0", className)}>
      <Link
        to="/task"
        search={{ uid: subtask.parentUid }}
        replace={true}
        className={cn(buttonVariants({ variant: "ghost" }), "gap-1")}
        onClick={handleBack}
      >
        <ChevronLeft className="mr-1.5 size-4" /> {t("subtask.back")}
      </Link>
    </div>
  );
};

export const CompleteSubtaskButton: React.FC<{
  subtask: SubtaskInfo | undefined;
  showCompleteButton: boolean;
}> = ({ subtask, showCompleteButton }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const onCompleteSubtask = useCallback(() => {
    if (!subtask || !showCompleteButton) {
      return null;
    }
    navigate({
      to: "/task",
      search: {
        uid: subtask.parentUid,
      },
      replace: true,
      viewTransition: true,
    });
  }, [navigate, subtask, showCompleteButton]);

  if (!subtask || !showCompleteButton) {
    return null;
  }

  return (
    <Button className="flex-1 rounded-sm" onClick={onCompleteSubtask}>
      {t("subtask.complete")}
    </Button>
  );
};
