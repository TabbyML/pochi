import { encodeStoreId } from "@getpochi/common/store-id-utils";
import { catalog } from "@getpochi/livekit";
import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker&inline";
import { LiveStoreProvider as LiveStoreProviderImpl } from "@livestore/react";
import * as jose from "jose";
import { Loader2 } from "lucide-react";
import { createContext, useContext, useMemo, useState } from "react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";
import { useCurrentWorkspace } from "./lib/hooks/use-current-workspace";
import { useMachineId } from "./lib/hooks/use-machine-id";
import { usePochiCredentials } from "./lib/hooks/use-pochi-credentials";
import LiveStoreWorker from "./livestore.worker.ts?worker&inline";

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

interface StoreDateContextType {
  date: Date;
  setDate: (date: Date) => void;
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
  const [date, setDate] = useState(new Date());
  const storeId = useStoreId(jwt, date.toLocaleDateString("en-US"));
  const syncPayload = useMemo(() => ({ jwt }), [jwt]);

  const storeDateContextValue = useMemo(() => ({ date, setDate }), [date]);

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
        {children}
      </LiveStoreProviderImpl>
    </StoreDateContext.Provider>
  );
}

function useStoreId(jwt: string | null, date: string) {
  const { data: cwd = "default" } = useCurrentWorkspace();
  const { data: machineId = "default" } = useMachineId();
  const sub = (jwt ? jose.decodeJwt(jwt).sub : undefined) ?? "anonymous";

  return encodeStoreId({ sub, machineId, cwd, date });
}

function Loading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Loader2 className="animate-spin" />
    </div>
  );
}
