import type { CfTypes } from "@livestore/sync-cf/cf-worker";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";
import { selectShard } from "./lib/shard";
import { fetch } from "./router";
import type { Env } from "./types";

export class SyncBackendDO extends SyncBackend.makeDurableObject() {
  constructor(controller: CfTypes.DurableObjectState, env: Env) {
    const doId = BigInt(`0x${controller.id.toString()}`);
    super(controller, {
      ...env,
      DB: selectShard(env, doId),
    });
  }
}

// Scoped by storeId
export { LiveStoreClientDO } from "./client";

export default {
  fetch,
} satisfies CfTypes.ExportedHandler<Env>;
