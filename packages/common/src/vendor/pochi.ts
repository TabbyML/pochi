import { createAuthClient as createAuthClientImpl } from "better-auth/react";
import { hc } from "hono/client";
import type { PochiVendorConfig, UserInfo } from "../configuration";
import type { PochiApi, PochiApiClient } from "../pochi-api";
import { getServerBaseUrl } from "../vscode-webui-bridge";
import { VendorBase } from "./base";
import type { ModelOptions } from "./types";

type PochiCredentials = PochiVendorConfig["credentials"];

export class Pochi extends VendorBase {
  private newCredentials?: PochiCredentials = undefined;
  private cachedModels?: Record<string, ModelOptions>;

  constructor() {
    super("pochi");
  }

  override async fetchModels(): Promise<Record<string, ModelOptions>> {
    if (!this.cachedModels) {
      const apiClient: PochiApiClient = hc<PochiApi>(
        "https://app.getpochi.com",
      );
      const resp = await apiClient.api.models.$get();
      const data = await resp.json();
      this.cachedModels = Object.fromEntries(
        data.map((x) => [
          x.id,
          {
            contextWindow: x.contextWindow,
            useToolCallMiddleware: x.id.includes("google/"),
          } satisfies ModelOptions,
        ]),
      );
    }

    return this.cachedModels;
  }

  protected override async renewCredentials(
    credentials: PochiCredentials,
  ): Promise<PochiCredentials> {
    if (this.newCredentials) {
      const newCredentials = this.newCredentials;
      this.newCredentials = undefined;
      return newCredentials;
    }
    return credentials;
  }

  protected override async fetchUserInfo(
    credentials: PochiCredentials,
  ): Promise<UserInfo> {
    const authClient = this.createAuthClient(credentials?.token);
    const session = await authClient.getSession();
    if (!session.data) {
      throw new Error(session.error.message);
    }

    return {
      name: session.data.user.name,
      email: session.data.user.email,
      image: session.data.user.image || undefined,
    };
  }

  private createAuthClient(token: string | undefined) {
    const authClient = createAuthClientImpl({
      baseURL: getServerBaseUrl(),

      fetchOptions: {
        customFetchImpl: buildCustomFetchImpl(token),
        onResponse: (ctx) => {
          const authToken = ctx.response.headers.get("set-auth-token"); // get the token from the response headers
          if (authToken) {
            this.newCredentials = {
              token: authToken,
            };
          }
        },
      },
    });

    return authClient;
  }
}

const buildCustomFetchImpl = (token: string | undefined) => {
  return async (input: string | URL | Request, requestInit?: RequestInit) => {
    const headers = new Headers(requestInit?.headers);
    if (token) {
      headers.append("Authorization", `Bearer ${token}`);
    }
    return fetch(input, {
      ...requestInit,
      headers,
    });
  };
};
