import type { JSONSchema7 } from "@ai-sdk/provider";
import { getLogger } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import { deviceLinkClient } from "@getpochi/common/device-link/client";
import type { McpToolExecutable } from "@getpochi/common/mcp-utils";
import type { PochiApi, PochiApiClient } from "@getpochi/common/pochi-api";
import {
  type AuthOutput,
  type ModelOptions,
  VendorBase,
} from "@getpochi/common/vendor";
import {
  type PochiCredentials,
  getServerBaseUrl,
} from "@getpochi/common/vscode-webui-bridge";
import { jwtClient } from "better-auth/client/plugins";
import { createAuthClient as createAuthClientImpl } from "better-auth/react";
import { hc } from "hono/client";
import * as jose from "jose";
import z from "zod/v4";
import type { McpTool } from "../../tools/src/mcp-tools";
import { getPochiCredentials, updatePochiCredentials } from "./credentials";
import { VendorId } from "./types";

const logger = getLogger("PochiVendor");

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
    if (!credentials.jwt || isJWTExpiring(credentials.jwt)) {
      logger.debug("JWT is expiring or missing, fetching a new one");
      const { data } = await authClient.token();
      return {
        ...credentials,
        jwt: data?.token || null,
      };
    }

    return credentials;
  }

  protected override async fetchUserInfo(
    _credentials: PochiCredentials,
  ): Promise<UserInfo> {
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

  override async getTools(): Promise<
    Record<string, McpTool & McpToolExecutable>
  > {
    return {
      webFetch: {
        description: "Fetch a URL and return the content as text.",
        inputSchema: {
          jsonSchema: z.toJSONSchema(
            z.object({
              url: z.url(),
            }),
          ) as JSONSchema7,
        },
        execute: async (args: { url: string }) => {
          const { jwt } = (await this.getCredentials()) as PochiCredentials;
          const response = await fetch(
            "https://api-gateway.getpochi.com/https/r.jina.ai",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${jwt}`,
              },
              body: JSON.stringify(args),
            },
          );
          if (response.ok) {
            const content = await response.text();
            return {
              content: [
                {
                  type: "text",
                  text: content,
                },
              ],
            };
          }

          throw new Error(`Failed to fetch: ${response.statusText}`);
        },
      },
    };
  }
}

function createAuthClient() {
  const authClient = createAuthClientImpl({
    baseURL: getServerBaseUrl(),
    plugins: [deviceLinkClient(), jwtClient()],

    fetchOptions: {
      customFetchImpl: buildCustomFetchImpl(),
      onResponse: (ctx) => {
        const token = ctx.response.headers.get("set-auth-token"); // get the token from the response headers
        if (token) {
          updatePochiCredentials({
            token,
          });
        }
      },
    },
  });

  return authClient;
}

const buildCustomFetchImpl = () => {
  return async (input: string | URL | Request, requestInit?: RequestInit) => {
    const token = getPochiCredentials()?.token;
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

export const authClient = createAuthClient();

function isJWTExpiring(jwt: string) {
  const { exp } = jose.decodeJwt(jwt);
  return exp ? Date.now() >= (exp - 5 * 60) * 1000 : true;
}
