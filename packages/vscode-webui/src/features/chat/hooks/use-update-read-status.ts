import { useVisibleTaskPanels } from "@/lib/hooks/use-visible-task-panels";
import { vscodeHost } from "@/lib/vscode";
import type { Task } from "@getpochi/livekit";
import { useEffect, useMemo } from "react";

export function useUpdateReadStatus({
  task,
  isSubTask,
}: {
  task: Task | undefined;
  isSubTask: boolean;
}) {
  const taskUid = isSubTask ? task?.parentId : task?.id;
  const visibleTaskPanels = useVisibleTaskPanels();

  const isTaskPanelVisible = useMemo(() => {
    const uid = isSubTask ? task?.parentId : task?.id;
    if (!uid || !task?.cwd) return false;
    return (
      visibleTaskPanels.findIndex((x) => x.cwd === task.cwd && x.uid === uid) >
      -1
    );
  }, [visibleTaskPanels, task, isSubTask]);

  // Trigger taskReadStatusChanged when task status changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: watch for taskStatus
  useEffect(() => {
    if (!taskUid || !task?.cwd) return;

    vscodeHost.onTaskUpdated({
      name: "taskReadStatusChanged",
      taskId: taskUid,
      isRead: isTaskPanelVisible,
    });
  }, [taskUid, task?.status, task?.cwd]);

  // Trigger taskReadStatusChanged when panel becomes visible
  useEffect(() => {
    if (!taskUid || !task?.cwd) return;
    if (!isTaskPanelVisible) return;

    // Only trigger when panel becomes visible (false -> true)
    vscodeHost.onTaskUpdated({
      name: "taskReadStatusChanged",
      taskId: taskUid,
      isRead: isTaskPanelVisible,
    });
  }, [taskUid, task?.cwd, isTaskPanelVisible]);
}
