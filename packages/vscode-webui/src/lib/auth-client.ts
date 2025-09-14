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
  headers.set("X-Pochi-Extension-Version", extensionVersion);
  return fetch(input, {
    ...requestInit,
    headers,
  });
};

function createApiClient(): PochiApiClient {
  return hc<PochiApi>(getServerBaseUrl(), {
    fetch: customFetchImpl,
  });
}

export const apiClient = createApiClient();
