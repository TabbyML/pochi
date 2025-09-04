import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { PochiVendorConfig } from "@getpochi/common/configuration";
import type { PochiApi, PochiApiClient } from "@getpochi/common/pochi-api";
import { wrapLanguageModel } from "ai";
import {
  type GoogleCloudCodeProviderSettings,
  createGoogleCloudCode,
} from "cloud-code-ai-provider";
import { hc } from "hono/client";
import type { RequestData } from "../../types";
import { createGeminiCliModel } from "./gemini-cli";
import { createPochiModel } from "./pochi";

export function createVendorModel(
  llm: Extract<RequestData["llm"], { type: "vendor" }>,
) {
  if (!llm.credentials) {
    throw new Error(`Missing credentials for ${llm.vendorId}`);
  }

  return wrapLanguageModel({
    model: createModel(llm.vendorId, llm.credentials, llm.modelId),
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        params.maxOutputTokens = llm.options.maxOutputTokens;
        return params;
      },
    },
  });
}

function createModel(
  vendorId: string,
  credentials: unknown,
  modelId: string,
): LanguageModelV2 {
  // FIXME(meng): this would add cloud-code-ai-provider dependency,
  //  and it has issues running in browser env which would break the vscode-webui build.
  //
  if (vendorId === "gemini-cli") {
    return createGeminiCliModel(credentials, "phonic-yarrow-thqbd", modelId);
    return createGoogleCloudCode({
      credentials:
        credentials as GoogleCloudCodeProviderSettings["credentials"],
    })(modelId);
  }

  if (vendorId === "pochi") {
    return createPochiModel(modelId, {
      type: "pochi",
      modelId,
      apiClient: createApiClient(
        credentials as PochiVendorConfig["credentials"],
      ),
    });
  }

  throw new Error(`Unknown vendor: ${vendorId}`);
}

function createApiClient(
  credentials: PochiVendorConfig["credentials"],
): PochiApiClient {
  const token = credentials?.token;
  const authClient: PochiApiClient = hc<PochiApi>("https://app.getpochi.com", {
    fetch(input: string | URL | Request, init?: RequestInit) {
      const headers = new Headers(init?.headers);
      if (token) {
        headers.append("Authorization", `Bearer ${token}`);
      }
      return fetch(input, {
        ...init,
        headers,
      });
    },
  });

  authClient.authenticated = !!token;
  return authClient;
}
