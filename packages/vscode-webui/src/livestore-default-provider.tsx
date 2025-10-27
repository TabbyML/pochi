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
import { usePochiCredentials } from "./lib/hooks/use-pochi-credentials";
import LiveStoreWorker from "./livestore.default.worker.ts?worker&inline";

const logger = getLogger("LiveStoreProvider");

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

export function LiveStoreDefaultProvider({
  taskId,
  children,
}: { taskId: string; children: React.ReactNode }) {
  const { jwt, isPending } = usePochiCredentials();
  if (isPending) return null;
  return (
    <LiveStoreProviderInner jwt={jwt} taskId={taskId}>
      {children}
    </LiveStoreProviderInner>
  );
}

function LiveStoreProviderInner({
  jwt,
  taskId,
  children,
}: {
  jwt: string | null;
  taskId: string;
  children: React.ReactNode;
}) {
  const storeId = useStoreId(jwt, taskId);
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

function useStoreId(jwt: string | null, taskId: string) {
  const sub = (jwt ? jose.decodeJwt(jwt).sub : undefined) ?? "anonymous";

  return encodeStoreId({ sub, taskId });
}

function Loading() {
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <Loader2 className="animate-spin" />
    </div>
  );
}
