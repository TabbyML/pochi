import type { PochiApi, PochiApiClient } from "@getpochi/common/pochi-api";
import { getPochiCredentials } from "@getpochi/vendor-pochi";
import { hc } from "hono/client";
import packageJson from "../../package.json";

const prodServerUrl = "https://app.getpochi.com";
const userAgent = `PochiCli/${packageJson.version} Node/${process.version} (${process.platform}; ${process.arch})`;

export async function createApiClient(): Promise<PochiApiClient> {
  const token = getPochiCredentials()?.token;

  const apiClient: PochiApiClient = hc<PochiApi>(prodServerUrl, {
    fetch(input: string | URL | Request, init?: RequestInit) {
      const headers = new Headers(init?.headers);
      if (token) {
        headers.append("Authorization", `Bearer ${token}`);
      }
      headers.set("User-Agent", userAgent);
      return fetch(input, {
        ...init,
        headers,
      });
    },
  });

  const proxed = new Proxy(apiClient, {
    get(target, prop, receiver) {
      if (prop === "authenticated") {
        return !!token;
      }
      return Reflect.get(target, prop, receiver);
    },
  });

  return proxed;
}
