import { getLogger } from "@getpochi/common";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import { catalog } from "@getpochi/livekit";
import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker&inline";
import { LiveStoreProvider as LiveStoreProviderImpl } from "@livestore/react";
import * as jose from "jose";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";
import { useMachineId } from "./lib/hooks/use-machine-id";
import { usePochiCredentials } from "./lib/hooks/use-pochi-credentials";
import LiveStoreWorker from "./livestore.worker.ts?worker&inline";

const logger = getLogger("LiveStoreProvider");

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

export function LiveStoreProvider({ children }: { children: React.ReactNode }) {
  const { jwt, isPending } = usePochiCredentials();
  const { data: machineId } = useMachineId();
  if (isPending || !machineId) return null;
  return (
    <LiveStoreProviderInner jwt={jwt} machineId={machineId}>
      {children}
    </LiveStoreProviderInner>
  );
}

function LiveStoreProviderInner({
  jwt,
  machineId,
  children,
}: {
  jwt: string | null;
  machineId: string;
  children: React.ReactNode;
}) {
  const storeId = useStoreId(jwt, machineId);
  const syncPayload = useMemo(() => ({ jwt }), [jwt]);

  logger.debug("LiveStoreProvider re-rendered");
  return (
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
  );
}

function useStoreId(jwt: string | null, machineId: string) {
  const sub = (jwt ? jose.decodeJwt(jwt).sub : undefined) ?? "anonymous";

  return encodeStoreId({ sub, machineId });
}

function Loading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Loader2 className="animate-spin" />
    </div>
  );
}
