import os from "node:os";
import path from "node:path";
import { getStoreId } from "@getpochi/common/configuration";
import { getVendor } from "@getpochi/common/vendor";
import {
  type PochiCredentials,
  getSyncBaseUrl,
} from "@getpochi/common/vscode-webui-bridge";
import { catalog } from "@getpochi/livekit";
import { makeAdapter } from "@livestore/adapter-node";
import { type LiveStoreSchema, createStorePromise } from "@livestore/livestore";
import { makeWsSync } from "@livestore/sync-cf/client";

export async function createStore(cwd: string) {
  const storeId = await getStoreId(cwd);
  const { jwt = null } = (await getPochiCredentials()) || {};
  const adapter = makeAdapter({
    storage: {
      type: "fs",
      baseDirectory: path.join(os.homedir(), ".pochi", "storage"),
    },
    devtools: process.env.POCHI_LIVEKIT_DEVTOOLS
      ? {
          schemaPath: "../../packages/livekit/src/livestore/schema.ts",
        }
      : undefined,
    sync:
      jwt && process.env.POCHI_LIVEKIT_SYNC
        ? {
            backend: makeWsSync({
              url: getSyncBaseUrl(),
            }),
          }
        : undefined,
  });

  const store = await createStorePromise<LiveStoreSchema>({
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
