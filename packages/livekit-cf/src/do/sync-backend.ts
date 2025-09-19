import { DoSqlD1 } from "@/lib/do-sql-d1";
import type { Env } from "@/types";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";

let signalKeepAliveClientDO: (storeId: string) => Promise<void>;

export class SyncBackendDO extends SyncBackend.makeDurableObject({
  onPush: async (_message, { storeId }) => {
    await signalKeepAliveClientDO(storeId);
  },
}) {
  constructor(state: SyncBackend.CfTypes.DurableObjectState, env: Env) {
    super(state, {
      ...env,
      DB: new DoSqlD1(state.storage.sql),
    });

    signalKeepAliveClientDO = async (storeId: string) => {
      const id = env.CLIENT_DO.idFromName(storeId);
      const stub = env.CLIENT_DO.get(id);
      await stub.signalKeepAlive(storeId);
    };
  }
}
