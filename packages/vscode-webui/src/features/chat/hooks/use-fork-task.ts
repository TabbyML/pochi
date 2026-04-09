import { vscodeHost } from "@/lib/vscode";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import type { LiveKitStore, Task } from "@getpochi/livekit";
import { useCallback } from "react";
import type { useTranslation } from "react-i18next";

interface UseForkTaskProps {
  task: Task | undefined;
  store: LiveKitStore;
  jwt: string | null;
  t: ReturnType<typeof useTranslation>["t"];
}

export function useForkTask({ task, store, jwt, t }: UseForkTaskProps) {
  const forkTask = useCallback(
    async (commitId: string, messageId?: string) => {
      if (task?.cwd) {
        await forkTaskFromCheckpoint({
          store,
          jwt,
          title: task.title
            ? t("forkTask.forkedTaskTitle", { taskTitle: task.title })
            : undefined,
          cwd: task.cwd,
          commitId,
          messageId,
          taskId: task.id,
        });
      }
    },
    [store, task, jwt, t],
  );

  return { forkTask };
}

async function forkTaskFromCheckpoint({
  store,
  jwt,
  title,
  cwd,
  commitId,
  taskId,
  messageId,
}: {
  store: LiveKitStore;
  jwt: string | null;
  title: string | undefined;
  cwd: string;
  commitId: string;
  taskId: string;
  messageId?: string;
}) {
  const newTaskId = crypto.randomUUID();
  const storeId = encodeStoreId(jwt, newTaskId);

  await vscodeHost.restoreCheckpoint(commitId);

  await vscodeHost.openTaskInPanel(
    {
      type: "open-task",
      cwd,
      uid: taskId,
    },
    { keepEditor: true },
  );

  await vscodeHost.openTaskInPanel({
    type: "fork-task",
    cwd,
    uid: newTaskId,
    storeId,
    forkParams: {
      sourceStoreId: store.storeId,
      sourceTaskId: taskId,
      commitId,
      messageId,
      title,
    },
  });
}
