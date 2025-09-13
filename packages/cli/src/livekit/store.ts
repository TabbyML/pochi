import os from "node:os";
import path from "node:path";
import { getStoreId } from "@getpochi/common/configuration";
import { catalog } from "@getpochi/livekit";
import { makeAdapter } from "@livestore/adapter-node";
import { type LiveStoreSchema, createStorePromise } from "@livestore/livestore";

const adapter = makeAdapter({
  storage: {
    type: "fs",
    baseDirectory: path.join(os.homedir(), ".pochi", "storage"),
  },
  devtools: process.env.POCHI_LIVEKIT_DEVTOOLS
    ? {
        schemaPath: "../../../packages/livekit/src/livestore/schema.ts",
      }
    : undefined,
});

export async function createStore(cwd: string) {
  const storeId = await getStoreId(cwd);
  const store = await createStorePromise<LiveStoreSchema>({
    adapter,
    schema: catalog.schema,
    storeId: storeId,
  });
  return store;
}
