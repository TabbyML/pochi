import type { LanguageModelV2 } from "@ai-sdk/provider";
import type {
  GeminiCliVendorConfig,
  PochiVendorConfig,
} from "@getpochi/common/configuration";
import type { PochiApi, PochiApiClient } from "@getpochi/common/pochi-api";
import { wrapLanguageModel } from "ai";
import { hc } from "hono/client";
import type { RequestData } from "../../types";
import { createPochiModel } from "./pochi";
import { createGeminiCliModel } from "./gemini-cli";

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
  if (vendorId === "gemini-cli") {
    return createGeminiCliModel(
      credentials as GeminiCliVendorConfig["credentials"],
      "phonic-yarrow-thqbd",
      modelId,
    );
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
