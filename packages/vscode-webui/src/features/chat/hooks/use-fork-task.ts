import { vscodeHost } from "@/lib/vscode";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import type { LiveKitStore, Task } from "@getpochi/livekit";
import type { TFunction } from "i18next";
import { useCallback } from "react";

interface UseForkTaskProps {
  task: Task | undefined;
  store: LiveKitStore;
  jwt: string | null;
  t: TFunction;
}

/**
 * Forks the task into a new task that keeps the conversation up to and
 * including `messageId`. Files in the workspace are left as they are.
 */
export function useForkTask({ task, store, jwt, t }: UseForkTaskProps) {
  const forkTask = useCallback(
    async (messageId: string) => {
      if (!task?.cwd) return;

      const newTaskId = crypto.randomUUID();
      await vscodeHost.openTaskInPanel(
        {
          type: "open-task",
          cwd: task.cwd,
          uid: task.id,
        },
        { keepEditor: true },
      );

      await vscodeHost.openTaskInPanel({
        type: "fork-task",
        cwd: task.cwd,
        uid: newTaskId,
        storeId: encodeStoreId(jwt, newTaskId),
        forkParams: {
          sourceStoreId: store.storeId,
          sourceTaskId: task.id,
          messageId,
          title: task.title
            ? (t("forkTask.forkedTaskTitle", {
                taskTitle: task.title,
              }) as string)
            : undefined,
        },
      });
    },
    [store, task, jwt, t],
  );

  return { forkTask };
}
