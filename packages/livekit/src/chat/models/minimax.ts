import { createMinimax } from "vercel-minimax-ai-provider";

import { fetchWithCorsProxy } from "@getpochi/common/fetch-utils";
import { wrapLanguageModel } from "ai";
import type { RequestData } from "../../types";

export function createMiniMaxModel(
  llm: Extract<RequestData["llm"], { type: "minimax" }>,
) {
  const minimax = createMinimax({
    baseURL: llm.baseURL,
    apiKey: llm.apiKey,
    fetch: fetchWithCorsProxy,
  });

  return wrapLanguageModel({
    model: minimax(llm.modelId),
    middleware: {
      specificationVersion: "v3",
      async transformParams({ params }) {
        params.maxOutputTokens = llm.maxOutputTokens;
        params.providerOptions = {
          // createMinimax uses the Anthropic messages protocol under the hood
          anthropic: {
            thinking: { type: "enabled" },
          },
        };
        return params;
      },
    },
  });
}
