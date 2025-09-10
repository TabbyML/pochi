import type { PochiApi, PochiApiClient } from "@getpochi/common/pochi-api";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import { hc } from "hono/client";
import { vscodeHost } from "./vscode";

let ExtensionVersionPromise: Promise<string> | null = null;

const getExtensionVersion = () => {
  if (!ExtensionVersionPromise) {
    ExtensionVersionPromise = vscodeHost.readExtensionVersion();
  }
  return ExtensionVersionPromise;
};

const customFetchImpl = async (
  input: RequestInfo | URL,
  requestInit?: RequestInit,
) => {
  const credentials = await vscodeHost.readPochiCredentials();
  const extensionVersion = await getExtensionVersion();
  const headers = new Headers(requestInit?.headers);
  if (credentials?.token) {
    headers.append("Authorization", `Bearer ${credentials.token}`);
  }
  apiClient.authenticated = !!credentials;
  headers.set("X-Pochi-Extension-Version", extensionVersion);
  return fetch(input, {
    ...requestInit,
    headers,
  });
};

function createApiClient(): PochiApiClient {
  const app = hc<PochiApi>(getServerBaseUrl(), {
    fetch: customFetchImpl,
  });

  let authenticated = false;
  // Initialize authentication status.
  vscodeHost.readPochiCredentials().then((credentials) => {
    authenticated = !!credentials;
  });

  const proxed = new Proxy(app, {
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

export const apiClient = createApiClient();
