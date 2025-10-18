import { getLogger } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import { deviceLinkClient } from "@getpochi/common/device-link/client";
import type { McpToolExecutable } from "@getpochi/common/mcp-utils";
import {
  type AuthOutput,
  type ModelOptions,
  VendorBase,
} from "@getpochi/common/vendor";
import {
  type PochiCredentials,
  getServerBaseUrl,
} from "@getpochi/common/vscode-webui-bridge";
import type { McpTool } from "@getpochi/tools";
import { jwtClient } from "better-auth/client/plugins";
import { createAuthClient as createAuthClientImpl } from "better-auth/react";
import { hc } from "hono/client";
import * as jose from "jose";
import { getPochiCredentials, updatePochiCredentials } from "./credentials";
import type { PochiApi, PochiApiClient } from "./pochi-api";
import { makeWebFetch, makeWebSearch } from "./tools";
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
      const data = await apiClient.api.models
        .$get()
        .then((x) => x.json())
        .catch(() => {
          return []; // Return an empty array on error
        });
      this.cachedModels = Object.fromEntries(
        data.map((x) => [
          x.id,
          {
            contextWindow: x.contextWindow,
            useToolCallMiddleware: x.id.includes("google/"),
            label: x.costType === "basic" ? "swift" : "super",
            contentType: x.id.includes("google/")
              ? [
                  // https://ai.google.dev/gemini-api/docs/image-understanding#supported-formats
                  "image/png",
                  "image/jpeg",
                  "image/webp",
                  "image/heic",
                  "image/heif",

                  // https://ai.google.dev/gemini-api/docs/video-understanding#supported-formats
                  "video/mp4",
                  "video/mpeg",
                  "video/mov",
                  "video/avi",
                  "video/x-flv",
                  "video/mpg",
                  "video/webm",
                  "video/wmv",
                  "video/3gpp",

                  // https://ai.google.dev/gemini-api/docs/audio#supported-formats
                  "audio/wav",
                  "audio/mp3",
                  "audio/aiff",
                  "audio/aac",
                  "audio/ogg",
                  "audio/flac",

                  // https://ai.google.dev/gemini-api/docs/document-processing#document-types
                  "application/pdf",
                ]
              : undefined,
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
    const getToken = () =>
      this.getCredentials().then((c) => (c as PochiCredentials).jwt || "");
    return {
      webFetch: makeWebFetch(getToken),
      webSearch: makeWebSearch(getToken),
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
  // Should refresh JWT token if it's expiring in the next 48 hours
  return exp ? Date.now() >= (exp - 60 * 60 * 48) * 1000 : true;
}
