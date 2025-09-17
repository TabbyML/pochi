import type { User } from "@/types";
import { HTTPException } from "hono/http-exception";
import * as jose from "jose";
import { JOSEError } from "jose/errors";
import { getServerBaseUrl } from "./server";

let JWKS: jose.GetKeyFunction<
  jose.JWSHeaderParameters,
  jose.FlattenedJWSInput
> | null = null;

export async function verifyJWT(env: "dev" | "prod" | undefined, jwt: string) {
  try {
    if (JWKS === null) {
      JWKS = jose.createRemoteJWKSet(
        new URL(`${getServerBaseUrl(env)}/api/auth/jwks`),
      );
    }

    const { payload: user } = await jose.jwtVerify<User>(jwt, JWKS, {
      issuer: getServerBaseUrl(env),
      audience: getServerBaseUrl(env),
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
