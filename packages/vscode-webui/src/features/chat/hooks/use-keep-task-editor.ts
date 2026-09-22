import { vscodeHost } from "@/lib/vscode";
import type { Task } from "@getpochi/livekit";
import { useEffect, useRef } from "react";

/**
 * change task tab from preview mode to pin mode when task status changed
 */
export const useKeepTaskEditor = (task?: Task) => {
  // undefined marks the first render; null means an empty panel was observed.
  const status = useRef<string | null | undefined>(undefined);
  const taskStatus = task?.status;
  const taskCwd = task?.cwd;
  useEffect(() => {
    if (
      taskCwd &&
      taskStatus !== status.current &&
      status.current !== undefined
    ) {
      vscodeHost.openTaskInPanel(
        {
          type: "open-task",
          uid: task.id,
          cwd: taskCwd,
        },
        { keepEditor: true },
      );
    }
    status.current = taskStatus ?? null;
  }, [taskStatus, taskCwd, task?.id]);
};
