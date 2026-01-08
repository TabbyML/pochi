import { isDev } from "@getpochi/common/vscode-webui-bridge";
import { taskCatalog } from "@getpochi/livekit";
import { makePersistedAdapter } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker&inline";
import { useStore } from "@livestore/react";
import LiveStoreWorker from "../livestore.task.worker.ts?worker&inline";

const adapter = makePersistedAdapter({
  storage: { type: "opfs" },
  worker: LiveStoreWorker,
  sharedWorker: LiveStoreSharedWorker,
});

// Only alphanumeric characters, underscores, and hyphens are allowed.
function sanitizeStoreId(str: string) {
  return str.replace(/[^a-zA-Z0-9_-]/g, "-");
}

function getTaskStoreId() {
  const baseURI = document.baseURI;
  const storeName = baseURI.startsWith("http://") ? "local-tasks" : "tasks";
  return sanitizeStoreId(isDev ? `dev-${storeName}` : storeName);
}

function taskStoreOptions(storeId: string) {
  return {
    storeId,
    schema: taskCatalog.schema,
    adapter,
  };
}

export function useTaskStore() {
  const storeId = getTaskStoreId();
  return useStore(taskStoreOptions(storeId));
}
