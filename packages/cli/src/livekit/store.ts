import os from "node:os";
import path from "node:path";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import { getVendor } from "@getpochi/common/vendor";
import {
  type PochiCredentials,
  getSyncBaseUrl,
} from "@getpochi/common/vscode-webui-bridge";
import { catalog } from "@getpochi/livekit";
import { makeAdapter } from "@livestore/adapter-node";
import { createStorePromise } from "@livestore/livestore";
import { makeWsSync } from "@livestore/sync-cf/client";

export async function createStore(taskId: string) {
  const { jwt = null } = (await getPochiCredentials()) || {};
  const storeId = encodeStoreId(jwt, taskId);
  const enableSync = !!process.env.POCHI_LIVEKIT_SYNC_ON;
  const adapter = makeAdapter({
    storage: enableSync
      ? {
          type: "fs",
          baseDirectory: path.join(os.homedir(), ".pochi", "storage"),
        }
      : { type: "in-memory" },
    devtools: process.env.POCHI_LIVEKIT_DEVTOOLS
      ? {
          schemaPath: "../../packages/livekit/src/livestore/schema.ts",
        }
      : undefined,
    sync:
      jwt && enableSync
        ? {
            backend: makeWsSync({
              url: getSyncBaseUrl(),
            }),
          }
        : undefined,
  });

  const store = await createStorePromise({
    adapter,
    schema: catalog.schema,
    storeId: storeId,
    syncPayload: {
      jwt,
    },
  });
  return store;
}

async function getPochiCredentials() {
  const pochi = getVendor("pochi");
  const credentials = (await pochi
    .getCredentials()
    .catch(() => null)) as PochiCredentials | null;
  return credentials;
}
