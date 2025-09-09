import type { UserInfo } from "@getpochi/common/configuration";
import { deviceLinkClient } from "@getpochi/common/device-link/client";
import type { PochiApi, PochiApiClient } from "@getpochi/common/pochi-api";
import {
  type AuthOutput,
  type ModelOptions,
  VendorBase,
} from "@getpochi/common/vendor";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import { createAuthClient as createAuthClientImpl } from "better-auth/react";
import { hc } from "hono/client";
import { getPochiCredentials, updatePochiCredentials } from "./node";
import { type PochiCredentials, VendorId } from "./types";

export class Pochi extends VendorBase {
  private cachedModels?: Record<string, ModelOptions>;

  constructor() {
    super(VendorId);
  }

  override authenticate(): Promise<AuthOutput> {
    throw new Error(
      "Please use the VSCode Extension UI to authenticate with Pochi.",
    );
  }

  override async fetchModels(): Promise<Record<string, ModelOptions>> {
    if (!this.cachedModels) {
      const apiClient: PochiApiClient = hc<PochiApi>(getServerBaseUrl());
      const resp = await apiClient.api.models.$get();
      const data = await resp.json();
      this.cachedModels = Object.fromEntries(
        data.map((x) => [
          x.id,
          {
            contextWindow: x.contextWindow,
            useToolCallMiddleware: x.id.includes("google/"),
            label: x.costType === "basic" ? "swift" : "super",
          } satisfies ModelOptions,
        ]),
      );
    }

    return this.cachedModels;
  }

  protected override async renewCredentials(
    credentials: PochiCredentials,
  ): Promise<PochiCredentials> {
    return credentials;
  }

  protected override async fetchUserInfo(
    _credentials: PochiCredentials,
  ): Promise<UserInfo> {
    const authClient = createAuthClient();
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
}

export function createAuthClient() {
  const credentials = getPochiCredentials();
  const authClient = createAuthClientImpl({
    baseURL: getServerBaseUrl(),
    plugins: [deviceLinkClient()],

    fetchOptions: {
      customFetchImpl: buildCustomFetchImpl(credentials?.token),
      onResponse: (ctx) => {
        const authToken = ctx.response.headers.get("set-auth-token"); // get the token from the response headers
        const jwtToken = ctx.response.headers.get("set-auth-jwt");
        if (authToken || jwtToken) {
          const token = authToken || credentials?.token;
          if (!token) {
            throw new Error("token is missing");
          }
          const jwt = jwtToken || credentials?.jwt || "";
          updatePochiCredentials({
            token,
            jwt,
          });
        }
      },
    },
  });

  return authClient;
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
