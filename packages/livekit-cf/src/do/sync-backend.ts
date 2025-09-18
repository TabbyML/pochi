import { DoSqlD1 } from "@/lib/do-sql-d1";
import type { Env } from "@/types";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";

export class SyncBackendDO extends SyncBackend.makeDurableObject() {
  constructor(state: SyncBackend.CfTypes.DurableObjectState, env: Env) {
    super(state, {
      ...env,
      DB: new DoSqlD1(state.storage.sql),
    });
  }
}
