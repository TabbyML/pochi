import { verifyJWT } from "@/lib/jwt";
import type { Env } from "@/types";
import { zValidator } from "@hono/zod-validator";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";

export const app = new Hono<{ Bindings: Env }>();

const Payload = z.object({
  jwt: z.string(),
});

app
  .all(
    "/",
    zValidator(
      "query",
      z.object({
        storeId: z.string(),
        payload: z.preprocess((val) => {
          if (typeof val === "string") {
            return JSON.parse(decodeURIComponent(val));
          }
          return val;
        }, Payload),
        transport: z.string(),
      }),
    ),
    async (c) => {
      const query = c.req.valid("query");

      if (!verifyStoreId(query.payload.jwt, query.storeId)) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }

      const requestParamsResult = SyncBackend.getSyncRequestSearchParams(
        c.req.raw,
      );
      if (requestParamsResult._tag === "Some") {
        return SyncBackend.handleSyncRequest({
          request: c.req.raw,
          searchParams: requestParamsResult.value,
          env: c.env,
          ctx: c.executionCtx as SyncBackend.CfTypes.ExecutionContext,
          options: {
            async validatePayload(inputPayload, { storeId }) {
              const { jwt } = Payload.parse(inputPayload);
              if (!verifyStoreId(jwt, storeId)) {
                throw new Error("Unauthorized");
              }
            },
          },
        });
      }
    },
  )
  .all(
    "/client-do/*",
    zValidator("query", z.object({ storeId: z.string() })),
    async (c) => {
      const query = c.req.valid("query");
      const id = c.env.CLIENT_DO.idFromName(query.storeId);
      return c.env.CLIENT_DO.get(id).fetch(c.req.raw);
    },
  );

async function verifyStoreId(jwt: string, storeId: string) {
  const user = await verifyJWT(jwt);
  return storeId.startsWith(`store-${user.sub}-`);
}
