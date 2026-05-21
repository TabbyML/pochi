import { createAnthropic } from "@ai-sdk/anthropic";
import { wrapLanguageModel } from "ai";
import type { RequestData } from "../../types";

export function createAnthropicModel(
  llm: Extract<RequestData["llm"], { type: "anthropic" }>,
) {
  const anthropic = createAnthropic({
    baseURL: llm.baseURL,
    apiKey: llm.apiKey,
    fetch: proxiedFetch,
  });

  return wrapLanguageModel({
    model: anthropic(llm.modelId),
    middleware: {
      specificationVersion: "v3",
      async transformParams({ params }) {
        params.maxOutputTokens = llm.maxOutputTokens;
        return params;
      },
    },
  });
}

export const proxiedFetch: typeof fetch = async (input, init) => {
  const proxyPrefix = globalThis.POCHI_CORS_PROXY_URL_PREFIX;
  if (!proxyPrefix) {
    return fetch(input, init);
  }

  const originalUrl = input instanceof Request ? input.url : input.toString();
  const url = new URL(`${proxyPrefix}${encodeURIComponent(originalUrl)}`);

  return fetch(url, init);
};
