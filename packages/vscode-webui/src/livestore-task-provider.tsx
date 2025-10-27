import { taskCatalog } from "@getpochi/livekit";
import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker&inline";
import { LiveStoreProvider } from "@livestore/react";
import { unstable_batchedUpdates as batchUpdates } from "react-dom";
import LiveStoreWorker from "./livestore.task.worker.ts?worker&inline";

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

export function LiveStoreTaskProvider({
  children,
}: { children: React.ReactNode }) {
  return (
    <LiveStoreProvider
      schema={taskCatalog.schema}
      adapter={adapter}
      renderLoading={(_) => <></>}
      batchUpdates={batchUpdates}
    >
      {children}
    </LiveStoreProvider>
  );
}
