import type { CfTypes } from "@livestore/sync-cf/cf-worker";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";
import { DoSqlD1 } from "./lib/do-sql-d1";
import { fetch } from "./router";
import type { Env } from "./types";

export class SyncBackendDO extends SyncBackend.makeDurableObject() {
  constructor(state: CfTypes.DurableObjectState, env: Env) {
    super(state, {
      ...env,
      DB: new DoSqlD1(state.storage.sql),
    });
  }
}

// Scoped by storeId
export { LiveStoreClientDO } from "./client";

export default {
  fetch,
} satisfies CfTypes.ExportedHandler<Env>;
