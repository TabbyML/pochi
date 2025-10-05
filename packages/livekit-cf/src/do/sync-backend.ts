import { env } from "cloudflare:workers";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";

export class SyncBackendDO extends SyncBackend.makeDurableObject({
  onPush: async (_message, { storeId }) => {
    const id = env.CLIENT_DO.idFromName(storeId);
    const stub = env.CLIENT_DO.get(id);
    await stub.signalKeepAlive(storeId);
  },
}) {}
