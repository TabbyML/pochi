import type { Env, User } from "@/types";
import { zValidator } from "@hono/zod-validator";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import * as jose from "jose";
import { JOSEError } from "jose/errors";
import { z } from "zod";

const JWKS = jose.createRemoteJWKSet(
  new URL("https://app.getpochi.com/api/auth/jwks"),
);

export const router = new Hono<{ Bindings: Env }>();

router.get(
  "/",
  zValidator(
    "query",
    z.object({
      storeId: z.string(),
      payload: z.preprocess(
        (val) => {
          if (typeof val === "string") {
            return JSON.parse(decodeURIComponent(val));
          }
          return val;
        },
        z.object({
          jwt: z.string().nullable(),
        }),
      ),
      transport: z.string(),
    }),
  ),
  async (c) => {
    const query = c.req.valid("query");
    if (!query.payload.jwt) {
      throw new HTTPException(401, { message: "Unauthorized" });
    }

    const user = await verifyUser(query.payload.jwt);
    const storeId = `store-${user.id}-${query.storeId}`;

    const requestParamsResult = SyncBackend.getSyncRequestSearchParams(
      c.req.raw,
    );
    if (requestParamsResult._tag === "Some") {
      return SyncBackend.handleSyncRequest({
        request: c.req.raw,
        searchParams: {
          ...requestParamsResult.value,
          storeId,
        },
        env: c.env,
        ctx: c.executionCtx as SyncBackend.CfTypes.ExecutionContext,
      });
    }

    const url = new URL(c.req.url);
    // Forward request to client DO
    if (url.pathname.endsWith("/client-do")) {
      const id = c.env.CLIENT_DO.idFromName(storeId);

      return c.env.CLIENT_DO.get(id).fetch(c.req.raw);
    }
  },
);

async function verifyUser(jwt: string) {
  try {
    const { payload: user } = await jose.jwtVerify<User>(jwt, JWKS, {
      issuer: "https://app.getpochi.com",
      audience: "https://app.getpochi.com",
    });
    return user;
  } catch (err) {
    if (err instanceof JOSEError) {
      throw new HTTPException(401, { message: `Unauthorized ${err.code}` });
    }

    throw err;
  }
}
