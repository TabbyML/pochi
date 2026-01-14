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
  const parentCwd = parentTask?.cwd ?? window.POCHI_TASK_INFO?.cwd;
  const parentDisplayId = parentTask?.displayId ?? null;
  const isPane = globalThis.POCHI_WEBVIEW_KIND === "pane";
  const handleBack = useCallback(
    (event: MouseEvent) => {
      if (!isPane) return;
      event.preventDefault();
      if (!parentCwd) return;
      vscodeHost.openTaskInPanel({
        type: "open-task",
        uid: subtask.parentUid,
        displayId: parentDisplayId,
        cwd: parentCwd,
        storeId: store.storeId,
      });
    },
    [isPane, parentCwd, parentDisplayId, store.storeId, subtask.parentUid],
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
