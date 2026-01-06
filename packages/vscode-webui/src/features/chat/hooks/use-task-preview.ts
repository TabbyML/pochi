import { vscodeHost } from "@/lib/vscode";
import type { Task } from "@getpochi/livekit";
import { useEffect, useRef } from "react";

/**
 * change task tab from preview mode to pin mode when task status changed
 */
export const useTaskTabPreview = (task?: Task) => {
  const status = useRef<string | null>(null);
  const taskStatus = task?.status;
  const taskCwd = task?.cwd;
  const taskDisplayId = task?.displayId;
  useEffect(() => {
    if (taskCwd && taskStatus !== status.current && status.current !== null) {
      vscodeHost.openTaskInPanel(
        {
          type: "open-task",
          uid: task.id,
          cwd: taskCwd,
          displayId: taskDisplayId ?? null,
        },
        { keepEditor: true },
      );
    }
    status.current = taskStatus ?? null;
  }, [taskStatus, taskCwd, taskDisplayId, task?.id]);
};
