import type { Env, User } from "@/types";
import { HTTPException } from "hono/http-exception";
import * as jose from "jose";
import { JOSEError } from "jose/errors";

const JWKS = jose.createRemoteJWKSet(
  new URL("https://app.getpochi.com/api/auth/jwks"),
);

export async function verifyJWT(env: Env, jwt: string) {
  try {
    const { payload: user } = await jose.jwtVerify<User>(jwt, JWKS, {
      issuer: "https://app.getpochi.com",
      audience: "https://app.getpochi.com",
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
