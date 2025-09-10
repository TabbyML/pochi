import type { PochiApi, PochiApiClient } from "@getpochi/common/pochi-api";
import { hc } from "hono/client";
import packageJson from "../../package.json";
import { getPochiCredentials } from "../livekit/store";

const prodServerUrl = "https://app.getpochi.com";
const userAgent = `PochiCli/${packageJson.version} Node/${process.version} (${process.platform}; ${process.arch})`;

export async function createApiClient(): Promise<PochiApiClient> {
  const apiClient: PochiApiClient = hc<PochiApi>(prodServerUrl, {
    async fetch(input: string | URL | Request, init?: RequestInit) {
      const credentials = await getPochiCredentials();
      const headers = new Headers(init?.headers);
      if (credentials?.token) {
        headers.append("Authorization", `Bearer ${credentials.token}`);
      }
      apiClient.authenticated = !!credentials;
      headers.set("User-Agent", userAgent);
      return fetch(input, {
        ...init,
        headers,
      });
    },
  });

  let authenticated = !!(await getPochiCredentials());
  const proxed = new Proxy(apiClient, {
    get(target, prop, receiver) {
      if (prop === "authenticated") {
        return authenticated;
      }
      return Reflect.get(target, prop, receiver);
    },
    set(target, prop, value, receiver) {
      if (prop === "authenticated") {
        authenticated = value;
        return true;
      }
      return Reflect.set(target, prop, value, receiver);
    },
  });

  return proxed;
}
