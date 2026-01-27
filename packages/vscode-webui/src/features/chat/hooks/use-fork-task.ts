import { getOrLoadTaskStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import type { Task } from "@getpochi/livekit";
import type { useLiveChatKit } from "@getpochi/livekit/react";

import type { StoreRegistry } from "@livestore/livestore";
import { useCallback } from "react";
import type { useTranslation } from "react-i18next";

interface UseForkTaskProps {
  task: Task | undefined;
  chatKit: ReturnType<typeof useLiveChatKit>;
  storeRegistry: StoreRegistry;
  jwt: string | null;
  t: ReturnType<typeof useTranslation>["t"];
}

export function useForkTask({
  task,
  chatKit,
  storeRegistry,
  jwt,
  t,
}: UseForkTaskProps) {
  const forkTask = useCallback(
    async (commitId: string, messageId?: string) => {
      if (task?.cwd) {
        await forkTaskFromCheckPoint(
          chatKit.fork,
          storeRegistry,
          jwt,
          task.title
            ? t("forkTask.forkedTaskTitle", { taskTitle: task.title })
            : undefined,
          task.cwd,
          commitId,
          messageId,
        );
      }
    },
    [chatKit.fork, storeRegistry, task, jwt, t],
  );

  return { forkTask };
}

async function forkTaskFromCheckPoint(
  fork: ReturnType<typeof useLiveChatKit>["fork"],
  storeRegistry: StoreRegistry,
  jwt: string | null,
  title: string | undefined,
  cwd: string,
  commitId: string,
  messageId?: string,
) {
  const newTaskId = crypto.randomUUID();
  const storeId = encodeStoreId(jwt, newTaskId);

  // Create store
  const targetStore = await getOrLoadTaskStore({
    storeRegistry,
    storeId,
    jwt,
  });

  // Copy data to new store
  fork(targetStore, {
    taskId: newTaskId,
    title,
    commitId,
    messageId,
  });

  // Restore checkpoint
  await vscodeHost.restoreCheckpoint(commitId);
  // Create new task
  await vscodeHost.openTaskInPanel({
    type: "fork-task",
    cwd,
    uid: newTaskId,
    storeId,
  });
}
