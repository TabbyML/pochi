import type { Env, User } from "@/types";
import { decodeStoreId } from "@getpochi/common/store-id-utils";
import { HTTPException } from "hono/http-exception";
import * as jose from "jose";
import { JOSEError } from "jose/errors";
import z from "zod";

const Payload = z.object({
  jwt: z.string(),
});

const JWKS = jose.createRemoteJWKSet(
  new URL("https://app.getpochi.com/api/auth/jwks"),
);

export async function verifyJWT(env: Env["ENVIRONMENT"], jwt: string) {
  try {
    const { payload: user } = await jose.jwtVerify<User>(jwt, JWKS, {
      issuer: "https://app.getpochi.com",
      audience: "https://app.getpochi.com",
      clockTolerance: env === "dev" ? "4 hours" : undefined,
    });
    return user;
  } catch (err) {
    if (err instanceof JOSEError) {
      throw new HTTPException(401, { message: `Unauthorized ${err.code}` });
    }

    throw err;
  }
}

async function verifyPayload(env: Env["ENVIRONMENT"], inputPayload: unknown) {
  const payload = Payload.parse(inputPayload);
  return verifyJWT(env, payload.jwt);
}

export async function verifyStoreId(
  env: Env["ENVIRONMENT"],
  payload: unknown,
  storeId: string,
) {
  const user = await verifyPayload(env, payload);
  if (user.sub === decodeStoreId(storeId).sub) {
    return user;
  }
}
