import type { CfTypes } from "@livestore/sync-cf/cf-worker";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";
import { DoSqlD1 } from "./lib/do-sql-d1";
import { fetch } from "./router";
import type { Env } from "./types";

let signalKeepAliveClientDo: ((storeId: string) => Promise<void>) | undefined =
  undefined;

export class SyncBackendDO extends SyncBackend.makeDurableObject({
  onPush: async (_message, { storeId }) => {
    await signalKeepAliveClientDo?.(storeId);
  },
}) {
  constructor(
    state: CfTypes.DurableObjectState,
    private readonly doEnv: Env,
  ) {
    super(state, {
      ...doEnv,
      DB: new DoSqlD1(state.storage.sql),
    });

    signalKeepAliveClientDo = this.signalKeepAliveClientDo.bind(this);
  }

  async signalKeepAliveClientDo(storeId: string) {
    const id = this.doEnv.CLIENT_DO.idFromName(storeId);
    const stub = this.doEnv.CLIENT_DO.get(id);
    await stub.signalKeepAlive(storeId);
  }
}

// Scoped by storeId
export { LiveStoreClientDO } from "./client";

export default {
  fetch,
} satisfies CfTypes.ExportedHandler<Env>;
