import { getLogger } from "@getpochi/common";
import { catalog } from "@getpochi/livekit";
import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker&inline";
import { LiveStoreProvider as LiveStoreProviderImpl } from "@livestore/react";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";
import LiveStoreWorker from "./livestore.default.worker.ts?worker&inline";

const logger = getLogger("LiveStoreProvider");

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

export function LiveStoreDefaultProvider({
  jwt,
  storeId,
  children,
}: {
  jwt: string | null;
  storeId: string;
  children: React.ReactNode;
}) {
  return (
    <LiveStoreProviderInner jwt={jwt} storeId={storeId}>
      {children}
    </LiveStoreProviderInner>
  );
}

function LiveStoreProviderInner({
  jwt,
  storeId,
  children,
}: {
  jwt: string | null;
  storeId: string;
  children: React.ReactNode;
}) {
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

function Loading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Loader2 className="animate-spin" />
    </div>
  );
}
