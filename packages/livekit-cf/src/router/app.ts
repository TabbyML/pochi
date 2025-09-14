import { verifyJWT } from "@/lib/jwt";
import type { Env } from "@/types";
import { zValidator } from "@hono/zod-validator";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";
import { base58_to_binary } from "base58-js";
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

      if (!(await verifyStoreId(c.env, query.payload.jwt, query.storeId))) {
        throw new HTTPException(401, { message: "Unauthorized" });
      }

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
              const { jwt } = Payload.parse(inputPayload);
              if (!(await verifyStoreId(c.env, jwt, storeId))) {
                throw new Error("Unauthorized");
              }
            },
          },
        });
      }
    },
  )
  .all("/stores/:storeId/*", async (c) => {
    const id = c.env.CLIENT_DO.idFromName(c.req.param("storeId"));
    return c.env.CLIENT_DO.get(id).fetch(c.req.raw);
  });

async function verifyStoreId(env: Env, jwt: string, storeId: string) {
  const user = await verifyJWT(env, jwt);
  return user.sub === decodeSubFromStoreId(storeId);
}

const decodeSubFromStoreId = (storeId: string) => {
  const decoded = new TextDecoder().decode(base58_to_binary(storeId));
  return (
    JSON.parse(decoded) as {
      sub: string;
    }
  ).sub;
};
