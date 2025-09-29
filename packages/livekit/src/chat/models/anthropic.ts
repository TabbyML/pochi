import { createAnthropic } from "@ai-sdk/anthropic";
import { wrapLanguageModel } from "ai";
import type { RequestData } from "../../types";

export function createAnthropicModel(
  llm: Extract<RequestData["llm"], { type: "anthropic" }>,
) {
  const anthropic = createAnthropic({
    baseURL: llm.baseURL,
    apiKey: llm.apiKey,
    fetch: proxedFetch,
  });

  return wrapLanguageModel({
    model: anthropic(llm.modelId),
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        params.maxOutputTokens = llm.maxOutputTokens;
        return params;
      },
    },
  });
}

const proxedFetch: typeof fetch = async (input, init) => {
  const url = new URL(input.toString());
  const origin = url.origin;
  url.protocol = "http:";
  url.host = "localhost";
  url.port = globalThis.POCHI_CORS_PROXY_PORT;

  const headers = {
    ...init?.headers,
    "x-proxy-origin": origin,
  };
  return fetch(url, {
    ...init,
    headers,
  });
};
