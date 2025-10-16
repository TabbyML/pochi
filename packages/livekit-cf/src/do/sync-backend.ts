import { env } from "cloudflare:workers";
import { verifyStoreId } from "@/lib/jwt";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";

export class SyncBackendDO extends SyncBackend.makeDurableObject({
  onPush: async (_message, { storeId, payload }) => {
    if (!(await verifyStoreId(payload, storeId))) {
      throw new Error("Unauthorized");
    }
    const id = env.CLIENT_DO.idFromName(storeId);
    const stub = env.CLIENT_DO.get(id);
    await stub.signalKeepAlive(storeId);
  },
  onPull: async (_message, { storeId, payload }) => {
    if (!(await verifyStoreId(payload, storeId))) {
      throw new Error("Unauthorized");
    }
  },
}) {}
