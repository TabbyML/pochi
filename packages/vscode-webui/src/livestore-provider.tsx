import { encodeStoreId } from "@getpochi/common/store-id-utils";
import { type Message, type Task, catalog } from "@getpochi/livekit";
import {
  makeInMemoryAdapter,
  makePersistedAdapter,
} from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker&inline";
import {
  LiveStoreContext,
  LiveStoreProvider as LiveStoreProviderImpl,
  useStore,
} from "@livestore/react";
import Emittery from "emittery";
import * as jose from "jose";
import { Loader2 } from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";
import { useMachineId } from "./lib/hooks/use-machine-id";
import { usePochiCredentials } from "./lib/hooks/use-pochi-credentials";
import { setActiveStore, vscodeHost } from "./lib/vscode";
import LiveStoreWorker from "./livestore.worker.ts?worker&inline";

const adapter =
  globalThis.POCHI_WEBVIEW_KIND === "sidebar"
    ? makePersistedAdapter({
        storage: { type: "opfs" },
        worker: LiveStoreWorker,
        sharedWorker: LiveStoreSharedWorker,
      })
    : makeInMemoryAdapter();

interface StoreDateContextType {
  storeDate: Date;
  setStoreDate: (date: Date) => void;
}

const StoreDateContext = createContext<StoreDateContextType | undefined>(
  undefined,
);

export type TaskSyncData = Task & { messages: Message[] };

export const taskSyncEvent = new Emittery<{ taskSync: TaskSyncData }>();

export function useStoreDate() {
  const context = useContext(StoreDateContext);
  if (context === undefined) {
    throw new Error("useStoreDate must be used within a LiveStoreProvider");
  }
  return context;
}

export function LiveStoreProvider({ children }: { children: React.ReactNode }) {
  const { jwt } = usePochiCredentials();
  const [storeDate, setStoreDate] = useState(new Date());
  const storeId = useStoreId(jwt, storeDate.toLocaleDateString("en-US"));
  const syncPayload = useMemo(() => ({ jwt }), [jwt]);

  const storeDateContextValue = useMemo(
    () => ({ storeDate, setStoreDate }),
    [storeDate],
  );

  return (
    <StoreDateContext.Provider value={storeDateContextValue}>
      <LiveStoreProviderImpl
        schema={catalog.schema}
        adapter={adapter}
        renderLoading={Loading}
        disableDevtools={true}
        batchUpdates={batchUpdates}
        syncPayload={syncPayload}
        storeId={storeId}
      >
        <StoreWithCommitHook>{children}</StoreWithCommitHook>
      </LiveStoreProviderImpl>
    </StoreDateContext.Provider>
  );
}

// FIXME(meng): this is largely a hack, we shall migrate to LiveStore events api once its ready
// https://github.com/livestorejs/livestore/pull/514
function StoreWithCommitHook({ children }: { children: React.ReactNode }) {
  const { store } = useStore();
  useEffect(() => {
    setActiveStore(store);
    return () => {
      setActiveStore(null);
    };
  }, [store]);

  useEffect(() => {
    if (globalThis.POCHI_WEBVIEW_KIND !== "pane") {
      return;
    }
    const unsubscribe = taskSyncEvent.on("taskSync", (task) => {
      store.commit(
        catalog.events.taskSync({
          ...task,
          shareId: task.shareId ?? undefined,
          cwd: task.cwd ?? undefined,
          title: task.title ?? undefined,
          parentId: task.parentId ?? undefined,
          git: task.git ?? undefined,
          totalTokens: task.totalTokens ?? undefined,
          error: task.error ?? undefined,
          createdAt: new Date(task.createdAt),
          updatedAt: new Date(task.updatedAt),
        }),
      );
    });
    return () => unsubscribe();
  }, [store]);

  if (globalThis.POCHI_WEBVIEW_KIND === "sidebar") {
    return children;
  }

  const storeWithProxy = useMemo(() => {
    return new Proxy(store, {
      get(target, prop, receiver) {
        const result = Reflect.get(target, prop, receiver);
        if (prop === "commit") {
          const commitWithHook = (...args: unknown[]) => {
            if (args.length !== 1) {
              throw new Error("Commit expects exactly one argument in LiveKit");
            }
            vscodeHost.bridgeStoreEvent(globalThis.POCHI_WEBVIEW_KIND, args[0]);
            result(...args);
          };
          return commitWithHook;
        }
        return result;
      },
    });
  }, [store]);

  return (
    <LiveStoreContext.Provider
      value={{ stage: "running", store: storeWithProxy }}
    >
      {children}
    </LiveStoreContext.Provider>
  );
}

function useStoreId(jwt: string | null, date: string) {
  const { data: machineId = "default" } = useMachineId();
  const sub = (jwt ? jose.decodeJwt(jwt).sub : undefined) ?? "anonymous";

  return encodeStoreId({ sub, machineId, date });
}

function Loading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Loader2 className="animate-spin" />
    </div>
  );
}
