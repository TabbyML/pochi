import { isDev } from "@getpochi/common/vscode-webui-bridge";
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
  // cwd,
  children,
}: { children: React.ReactNode; cwd: string }) {
  const { origin } = location;
  const storeName = origin.startsWith("http://") ? `${origin}-tasks` : "tasks";
  const storeId = sanitizeStoreId(isDev ? `dev-${storeName}` : storeName);
  return (
    <LiveStoreProvider
      storeId={storeId}
      schema={taskCatalog.schema}
      adapter={adapter}
      renderLoading={(_) => <></>}
      batchUpdates={batchUpdates}
    >
      {children}
    </LiveStoreProvider>
  );
}

// Only alphanumeric characters, underscores, and hyphens are allowed.
function sanitizeStoreId(str: string) {
  return str.replace(/[^a-zA-Z0-9_-]/g, "-");
}
