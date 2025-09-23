import type { CfTypes } from "@livestore/sync-cf/cf-worker";
import type { Env } from "./types";

import { verifyStoreId } from "@/lib/jwt";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";
import { Hono } from "hono";
import { cors } from "hono/cors";

export const app = new Hono<{ Bindings: Env }>();

const corsMiddleware = cors();
app
  .use("*", async (c, next) => {
    const url = new URL(c.req.url);
    if (url.searchParams.get("transport") === "http") {
      return corsMiddleware(c, next);
    }

    return next();
  })
  .all("/", async (c) => {
    const requestParamsResult = SyncBackend.getSyncRequestSearchParams(
      c.req.raw,
    );
    if (requestParamsResult._tag === "Some") {
      return SyncBackend.handleSyncRequest({
        request: c.req.raw,
        searchParams: requestParamsResult.value,
        env: {
          ...c.env,
          // @ts-expect-error - we're using a custom implementation
          DB: null,
        },
        ctx: c.executionCtx as SyncBackend.CfTypes.ExecutionContext,
        options: {
          async validatePayload(inputPayload, { storeId }) {
            const user = await verifyStoreId(
              c.env.ENVIRONMENT,
              inputPayload,
              storeId,
            );
            if (!user) {
              throw new Error("Unauthorized");
            }

            const id = c.env.CLIENT_DO.idFromName(storeId);
            const stub = c.env.CLIENT_DO.get(id);
            await stub.setOwner(user);
          },
        },
      });
    }
  })
  .all("/stores/:storeId/*", async (c) => {
    const id = c.env.CLIENT_DO.idFromName(c.req.param("storeId"));
    return c.env.CLIENT_DO.get(id).fetch(c.req.raw);
  });

export default {
  fetch: app.fetch,
} satisfies CfTypes.ExportedHandler<Env>;

export { SyncBackendDO, LiveStoreClientDO } from "./do";
