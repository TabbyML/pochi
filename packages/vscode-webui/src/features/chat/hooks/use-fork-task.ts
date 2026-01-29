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
          task.id,
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
  taskId: string,
  title: string | undefined,
  cwd: string,
  commitId: string,
  messageId?: string,
) {
  const newTaskId = crypto.randomUUID();
  const storeId = encodeStoreId(jwt, newTaskId);

  // Update status
  const { setForkTaskStatus } = await vscodeHost.readForkTaskStatus();
  await setForkTaskStatus(newTaskId, "inProgress");

  // Keep the current tab, otherwise it will be closed when new tab open
  await vscodeHost.openTaskInPanel(
    {
      type: "open-task",
      cwd,
      uid: taskId,
    },
    { keepEditor: true },
  );

  // **NOTE** Open new task tab before create new store to avoid this issue:
  // The user closes the recently opened task tab and forks a task in a remaining tab, then the fork action will be stuck.
  // This is caused by worker request of fetching wasm resource file returns 408.
  // It seems a VSCode bug related to service-worker: https://github.com/microsoft/vscode/blob/afaa5b6a1cca12101ce5ec608acca380e3333080/src/vs/workbench/contrib/webview/browser/pre/service-worker.js#L146C4-L146C26

  // Open new task tab
  await vscodeHost.openTaskInPanel({
    type: "fork-task",
    cwd,
    uid: newTaskId,
    storeId,
  });

  // Create store for the new task
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

  // Shutdown the new store
  await targetStore.shutdownPromise();

  // Restore checkpoint
  await vscodeHost.restoreCheckpoint(commitId);

  // Mark the fork task is ready, and store will be load in new tab
  await setForkTaskStatus(newTaskId, "ready");
}
