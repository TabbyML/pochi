import { deviceLinkClient } from "@getpochi/common/device-link/client";
import type { PochiApi } from "@getpochi/common/pochi-api";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import { createAuthClient as createAuthClientImpl } from "better-auth/react";
import { hc } from "hono/client";
import type { DependencyContainer } from "tsyringe";
import * as vscode from "vscode";
import packageJson from "../../package.json";
import { PostHog } from "./posthog";
import { TokenStorage } from "./token-storage";

const UserAgent = `Pochi/${packageJson.version} ${vscode.env.appName.replace(/\s+/g, "")}/${vscode.version} (${process.platform}; ${process.arch})`;

const buildCustomFetchImpl = (tokenStorage: TokenStorage) => {
  return async (input: string | URL | Request, requestInit?: RequestInit) => {
    const headers = new Headers(requestInit?.headers);
    headers.append("Authorization", `Bearer ${tokenStorage.token.value}`);
    headers.set("User-Agent", UserAgent);
    headers.set("X-Pochi-Extension-Version", packageJson.version);
    return fetch(input, {
      ...requestInit,
      headers,
    });
  };
};

export function createAuthClient(container: DependencyContainer) {
  const tokenStorage = container.resolve(TokenStorage);
  const posthog = container.resolve(PostHog);

  const authClient = createAuthClientImpl({
    baseURL: getServerBaseUrl(),
    plugins: [deviceLinkClient()],

    fetchOptions: {
      customFetchImpl: buildCustomFetchImpl(tokenStorage),
      onResponse: (ctx) => {
        const authToken = ctx.response.headers.get("set-auth-token"); // get the token from the response headers
        if (authToken) {
          tokenStorage.setToken(authToken);
        }
      },
    },
  });

  const identifyUser = () => {
    authClient.getSession().then(({ data }) => {
      if (data?.user) {
        posthog.identify(data.user.id, {
          email: data.user.email,
          name: data.user.name,
        });
      }
    });
  };

  identifyUser();
  return authClient;
}

export function createApiClient(container: DependencyContainer) {
  const tokenStorage = container.resolve(TokenStorage);

  const app = hc<PochiApi>(getServerBaseUrl(), {
    fetch: buildCustomFetchImpl(tokenStorage),
  });

  return app;
}

export type AuthClient = ReturnType<typeof createAuthClient>;
export type ApiClient = ReturnType<typeof createApiClient>;
