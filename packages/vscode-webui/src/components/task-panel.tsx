import { ChatSkeleton } from "@/features/chat";
import { useModelList } from "@/lib/hooks/use-model-list";
import { usePochiCredentials } from "@/lib/hooks/use-pochi-credentials";
import { useUserStorage } from "@/lib/hooks/use-user-storage";
import { blobStore } from "@/lib/remote-blob-store";
import {
  DefaultStoreOptionsProvider,
  useDefaultStore,
} from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { createVscodeBackgroundTaskStateStore } from "@/lib/vscode-background-task-state";
import { VscodeRunningTaskAdaptor } from "@/lib/vscode-running-task-adaptor";
import { getLogger } from "@getpochi/common";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import type { PochiTaskInfo } from "@getpochi/common/vscode-webui-bridge";
import { BackgroundJobManager, type LiveKitStore } from "@getpochi/livekit";
import { type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { GlobalStoreInitializer } from "./global-store-initializer";
import { TerminalContextStateInitializer } from "./terminal-context-state-initializer";
import { WelcomeScreen } from "./welcome-screen";

const logger = getLogger("TaskPanel");

/** Owns one store and its background jobs for the whole task Webview. */
export function TaskPanel({ children }: { children: ReactNode }) {
  const panelInfo = window.POCHI_PANEL_INFO;
  if (window.POCHI_WEBVIEW_KIND !== "pane" || panelInfo?.type !== "task") {
    return children;
  }
  return (
    <TaskPanelContent info={panelInfo.payload.task}>
      {children}
    </TaskPanelContent>
  );
}

function TaskPanelContent({
  info,
  children,
}: { info: PochiTaskInfo; children: ReactNode }) {
  const { users, isLoading: isUserLoading } = useUserStorage();
  const {
    modelList = [],
    isLoading: isModelListLoading,
    isFetching,
  } = useModelList(true);
  const { jwt, isPending } = usePochiCredentials();
  if (isUserLoading || isModelListLoading || isPending) return null;
  if (!users?.pochi && modelList.length === 0) {
    if (isFetching) return null;
    return <WelcomeScreen user={users?.pochi} />;
  }
  const storeId =
    ((info.type === "open-task" || info.type === "fork-task") &&
      info.storeId) ||
    encodeStoreId(jwt, info.uid);
  return (
    <DefaultStoreOptionsProvider storeId={storeId} jwt={jwt}>
      <Suspense fallback={<ChatSkeleton />}>
        <TaskPanelStore taskId={info.uid}>{children}</TaskPanelStore>
      </Suspense>
    </DefaultStoreOptionsProvider>
  );
}

function TaskPanelStore({
  taskId,
  children,
}: { taskId: string; children: ReactNode }) {
  const store = useDefaultStore();
  const [readyStore, setReadyStore] = useState<LiveKitStore>();
  const [error, setError] = useState<unknown>();
  const previousCleanup = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    let manager: BackgroundJobManager | undefined;
    void previousCleanup.current
      .then(async () => {
        if (!active) return;
        manager = BackgroundJobManager.forStore(store);
        manager.initialize({
          blobStore,
          adaptor: new VscodeRunningTaskAdaptor(),
          stateStore: createVscodeBackgroundTaskStateStore(),
          clearFileStateCache: (id) => vscodeHost.clearFileStateCache(id),
        });
        await manager.watchTask(taskId);
        if (active) setReadyStore(store);
      })
      .catch((error) => {
        if (active) setError(error);
      });
    return () => {
      active = false;
      if (manager) {
        previousCleanup.current = manager.dispose().catch((error) => {
          logger.warn("Failed to dispose background jobs", error);
        });
      }
    };
  }, [store, taskId]);

  if (error) throw error;
  return (
    <>
      <GlobalStoreInitializer />
      <TerminalContextStateInitializer />
      {readyStore === store ? (
        <Suspense fallback={<ChatSkeleton />}>{children}</Suspense>
      ) : (
        <ChatSkeleton />
      )}
    </>
  );
}
