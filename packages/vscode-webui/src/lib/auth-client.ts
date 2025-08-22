import { createAuthHooks } from "@daveyplate/better-auth-tanstack";
import type { PochiApi, PochiApiClient } from "@getpochi/common/pochi-api";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import { type ThreadSignal, threadSignal } from "@quilted/threads/signals";
import {
  type ResponseContext,
  createAuthClient as createAuthClientImpl,
} from "better-auth/react";
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

function createAuthClient() {
  const authClient = createAuthClientImpl({
    baseURL: getServerBaseUrl(),
    fetchOptions: {
      customFetchImpl,
      onResponse: (ctx: ResponseContext) => {
        const authToken = ctx.response.headers.get("set-auth-token"); // get the token from the response headers
        if (authToken) {
          getToken().then((signal) => {
            signal.value = authToken;
          });
        }
      },
    },
  });

  return authClient;
}

export const authClient = createAuthClient();

export type User = (typeof authClient.$Infer.Session)["user"];

export const authHooks = createAuthHooks(authClient);

function createApiClient(): PochiApiClient {
  const app = hc<PochiApi>(getServerBaseUrl(), {
    fetch: customFetchImpl,
  });

  // Initialize authentication status.
  getToken();

  return app;
}

export const apiClient = createApiClient();
