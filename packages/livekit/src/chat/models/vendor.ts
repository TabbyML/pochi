import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { PochiVendorConfig } from "@getpochi/common/configuration";
import type { PochiApi, PochiApiClient } from "@getpochi/common/pochi-api";
import { hc } from "hono/client";
import type { RequestData } from "../../types";
import { createGeminiCliModel } from "./gemini-cli";
import { createPochiModel } from "./pochi";
import { createVSCodeLmModel, type ChatFn } from "./vscode-lm";

export function createVendorModel(
  llm: Extract<RequestData["llm"], { type: "vendor" }>,
) {
  return createModel(llm.vendorId, llm.getCredentials, llm.modelId);
}

function createModel(
  vendorId: string,
  getCredentials: () => Promise<unknown>,
  modelId: string,
): LanguageModelV2 {
  if (vendorId === "gemini-cli") {
    return createGeminiCliModel(getCredentials, modelId);
  }

  if (vendorId === "pochi") {
    return createPochiModel(modelId, {
      type: "pochi",
      modelId,
      apiClient: createApiClient(getCredentials),
    });
  }

  if (vendorId === "vscode-lm") {
    return createVSCodeLmModel(getCredentials as () => Promise<ChatFn>);
  }

  throw new Error(`Unknown vendor: ${vendorId}`);
}

function createApiClient(
  getCredentials: () => Promise<unknown>,
): PochiApiClient {
  const authClient: PochiApiClient = hc<PochiApi>("https://app.getpochi.com", {
    async fetch(input: string | URL | Request, init?: RequestInit) {
      const { token } = (await getCredentials()) as NonNullable<
        PochiVendorConfig["credentials"]
      >;
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
