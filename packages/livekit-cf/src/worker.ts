import type { CfTypes } from "@livestore/sync-cf/cf-worker";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";
import { fetch } from "./router";
import type { Env } from "./types";

export class SyncBackendDO extends SyncBackend.makeDurableObject({
  onPush: async (_message, _data) => {
    // console.log(`onPush for store (${storeId})`);
  },
}) {}

// Scoped by storeId
export { LiveStoreClientDO } from "./client";

export default {
  fetch,
} satisfies CfTypes.ExportedHandler<Env>;
