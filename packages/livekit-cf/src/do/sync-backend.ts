import { env } from "cloudflare:workers";
import { verifyStoreId } from "@/lib/jwt";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";

export class SyncBackendDO extends SyncBackend.makeDurableObject({
  onPush: async (_message, { storeId, payload }) => {
    await verifyPayload(storeId, payload);
    const id = env.CLIENT_DO.idFromName(storeId);
    const stub = env.CLIENT_DO.get(id);
    await stub.signalKeepAlive(storeId);
  },
  onPull: async (_message, { storeId, payload }) => {
    await verifyPayload(storeId, payload);
  },
}) {}

async function verifyPayload(storeId: string, payload: unknown) {
  // If payload is undefined, it means come from internal backend, e.g DO-rpc
  if (payload && !(await verifyStoreId(payload, storeId))) {
    throw new Error("Unauthorized");
  }
}
