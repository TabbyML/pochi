import { Button } from "@/components/ui/button";
import { useNavigate } from "@/lib/hooks/use-navigate";
import { useDefaultStore } from "@/lib/use-default-store";
import { cn } from "@/lib/utils";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import { catalog } from "@getpochi/livekit";
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
  const navigate = useNavigate();

  const handleBackClick = useCallback(
    (event: MouseEvent) => {
      // Async tasks (runAsync=true) need VS Code API to switch panes, sync tasks use React Router
      if (runAsync && parentCwd && isVSCodeEnvironment()) {
        event.preventDefault();
        vscodeHost.openTaskInPanel({
          type: "open-task",
          uid: subtask.parentUid,
          cwd: parentCwd,
          storeId: store.storeId,
        });
      } else {
        // Use navigate for sync tasks
        navigate({
          to: "/task",
          search: { uid: subtask.parentUid },
          replace: true,
          viewTransition: true,
        });
      }
    },
    [parentCwd, store.storeId, subtask.parentUid, runAsync, navigate],
  );

  return (
    <div className={cn("px-2 pb-0", className)}>
      <Button variant="ghost" className="gap-1" onClick={handleBackClick}>
        <ChevronLeft className="mr-1.5 size-4" /> {t("subtask.back")}
      </Button>
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
