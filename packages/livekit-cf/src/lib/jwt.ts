import { env } from "cloudflare:workers";
import type { User } from "@/types";
import { decodeStoreId } from "@getpochi/common/store-id-utils";
import { HTTPException } from "hono/http-exception";
import * as jose from "jose";
import { JOSEError } from "jose/errors";
import z from "zod";
import { getServerBaseUrl } from "./server";

const Payload = z.object({
  jwt: z.string(),
});

let JWKS: jose.JWTVerifyGetKey | null = null;

export async function getJWKS() {
  const serverUrl = getServerBaseUrl(env.ENVIRONMENT);
  const key = `jwks:${serverUrl}`;
  let jwks: string | null = null;
  if (env.ENVIRONMENT !== "dev") {
    jwks = await env.CACHE.get(key);
  }

  if (!jwks) {
    const res = await fetch(new URL(`${serverUrl}/api/auth/jwks`));
    jwks = await res.text();
  }

  if (env.ENVIRONMENT !== "dev") {
    await env.CACHE.put(key, jwks, {
      expirationTtl: 60 * 60 * 24,
    });
  }

  return jose.createLocalJWKSet(JSON.parse(jwks));
}

export async function verifyJWT(jwt: string) {
  const serverUrl = getServerBaseUrl(env.ENVIRONMENT);
  if (JWKS === null) {
    JWKS = await getJWKS();
  }
  try {
    const { payload: user } = await jose.jwtVerify<User>(jwt, JWKS, {
      issuer: serverUrl,
      audience: serverUrl,
      clockTolerance: env.ENVIRONMENT === "dev" ? "4 hours" : undefined,
    });
    return user;
  } catch (err) {
    if (err instanceof JOSEError) {
      throw new HTTPException(401, { message: `Unauthorized ${err.code}` });
    }

    throw err;
  }
}

async function verifyPayload(inputPayload: unknown) {
  const payload = Payload.parse(inputPayload);
  return verifyJWT(payload.jwt);
}

export async function verifyStoreId(payload: unknown, storeId: string) {
  const user = await verifyPayload(payload);
  if (user.sub === decodeStoreId(storeId).sub) {
    return user;
  }
}
