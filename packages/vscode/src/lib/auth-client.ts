import type { PochiApi } from "@getpochi/common/pochi-api";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import { authClient, getPochiCredentials } from "@getpochi/vendor-pochi";
import { hc } from "hono/client";
import type { DependencyContainer } from "tsyringe";
import * as vscode from "vscode";
import packageJson from "../../package.json";
import { PostHog } from "./posthog";

const UserAgent = `Pochi/${packageJson.version} ${vscode.env.appName.replace(/\s+/g, "")}/${vscode.version} (${process.platform}; ${process.arch})`;

const buildCustomFetchImpl = () => {
  return async (input: string | URL | Request, requestInit?: RequestInit) => {
    const token = getPochiCredentials()?.token;
    const headers = new Headers(requestInit?.headers);
    headers.append("Authorization", `Bearer ${token}`);
    headers.set("User-Agent", UserAgent);
    headers.set("X-Pochi-Extension-Version", packageJson.version);
    return fetch(input, {
      ...requestInit,
      headers,
    });
  };
};

export function createAuthClient(container: DependencyContainer) {
  const posthog = container.resolve(PostHog);

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

export function createApiClient() {
  const app = hc<PochiApi>(getServerBaseUrl(), {
    fetch: buildCustomFetchImpl(),
  });

  return app;
}

export type AuthClient = ReturnType<typeof createAuthClient>;
export type ApiClient = ReturnType<typeof createApiClient>;
