import type { PochiApi, PochiApiClient } from "@getpochi/common/pochi-api";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import { type ThreadSignal, threadSignal } from "@quilted/threads/signals";
import { hc } from "hono/client";
import { vscodeHost } from "./vscode";

let TokenSignal: ThreadSignal<string | undefined> | null = null;
let ExtensionVersionPromise: Promise<string> | null = null;

const getToken = async () => {
  if (!TokenSignal) {
    const signal = threadSignal(await vscodeHost.readToken());
    signal.subscribe(async (token) => {
      apiClient.authenticated = !!token;
    });
    TokenSignal = signal;
  }
  return TokenSignal;
};

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
  const token = await getToken();
  const extensionVersion = await getExtensionVersion();
  const headers = new Headers(requestInit?.headers);
  if (token) {
    headers.append("Authorization", `Bearer ${token.value}`);
  }
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

  // Initialize authentication status.
  getToken();

  let authenticated = false;
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
