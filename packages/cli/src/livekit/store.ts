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
import { type LiveStoreSchema, createStorePromise } from "@livestore/livestore";
import { makeWsSync } from "@livestore/sync-cf/client";
import * as jose from "jose";
import { machineId } from "node-machine-id";

export async function createStore(cwd: string) {
  const { jwt = null } = (await getPochiCredentials()) || {};
  const storeId = await getStoreId(jwt, cwd);
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
    sync: jwt
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

async function getStoreId(jwt: string | null, cwd: string) {
  const sub = (jwt ? jose.decodeJwt(jwt).sub : undefined) ?? "anonymous";
  const date = new Date().toLocaleDateString("en-US");

  return encodeStoreId({ sub, machineId: await machineId(), cwd, date });
}
