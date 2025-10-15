import { encodeStoreId } from "@getpochi/common/store-id-utils";
import { catalog } from "@getpochi/livekit";
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
import * as jose from "jose";
import { Loader2 } from "lucide-react";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

  // FIXME(kweizh): apply the official solution after this is fixed:
  // https://github.com/livestorejs/livestore/issues/571
  //
  // Create a stable object wrapper for JWT to prevent LiveStore errors
  // when JWT changes. The wrapper object reference stays the same,
  // only the jwt property inside is updated.
  const syncPayloadRef = useRef<{ jwt: string | null }>({ jwt });

  // Update the JWT value inside the stable wrapper when it changes
  useEffect(() => {
    syncPayloadRef.current.jwt = jwt;
  }, [jwt]);

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
        syncPayload={syncPayloadRef.current}
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
  if (globalThis.POCHI_WEBVIEW_KIND === "sidebar") {
    useEffect(() => {
      setActiveStore(store);
      return () => {
        setActiveStore(null);
      };
    }, [store]);
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
