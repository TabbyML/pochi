import { catalog } from "@getpochi/livekit";
import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker&inline";
import { LiveStoreProvider as LiveStoreProviderImpl } from "@livestore/react";
import type React from "react";
import { useMemo } from "react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";
import LiveStoreWorker from "./livestore.default.worker.ts?worker&inline";

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

export function LiveStoreDefaultProvider({
  jwt,
  storeId,
  children,
  renderLoading,
}: {
  jwt: string | null;
  storeId: string;
  children: React.ReactNode;
  renderLoading: () => React.ReactNode;
}) {
  return (
    <LiveStoreProviderInner
      jwt={jwt}
      storeId={storeId}
      renderLoading={renderLoading}
    >
      {children}
    </LiveStoreProviderInner>
  );
}

function LiveStoreProviderInner({
  jwt,
  storeId,
  children,
  renderLoading,
}: {
  jwt: string | null;
  storeId: string;
  renderLoading: () => React.ReactNode;
  children: React.ReactNode;
}) {
  const syncPayload = useMemo(() => ({ jwt }), [jwt]);

  return (
    <LiveStoreProviderImpl
      schema={catalog.schema}
      adapter={adapter}
      renderLoading={renderLoading}
      disableDevtools={true}
      batchUpdates={batchUpdates}
      syncPayload={syncPayload}
      storeId={storeId}
    >
      {children}
    </LiveStoreProviderImpl>
  );
}
