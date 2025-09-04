import type { LanguageModelV2 } from "@ai-sdk/provider";
import type {
  GeminiCliVendorConfig,
  PochiVendorConfig,
} from "@getpochi/common/configuration";
import type { PochiApi, PochiApiClient } from "@getpochi/common/pochi-api";
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

  return createModel(llm.vendorId, llm.credentials, llm.modelId);
}

function createModel(
  vendorId: string,
  credentials: unknown,
  modelId: string,
): LanguageModelV2 {
  if (vendorId === "gemini-cli") {
    return createGeminiCliModel(
      credentials as GeminiCliVendorConfig["credentials"],
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
  credentials: NonNullable<PochiVendorConfig["credentials"]>,
): PochiApiClient {
  const { token } = credentials;
  const authClient: PochiApiClient = hc<PochiApi>("https://app.getpochi.com", {
    fetch(input: string | URL | Request, init?: RequestInit) {
      const headers = new Headers(init?.headers);
      headers.append("Authorization", `Bearer ${token}`);
      return fetch(input, {
        ...init,
        headers,
      });
    },
  });

  return authClient;
}
