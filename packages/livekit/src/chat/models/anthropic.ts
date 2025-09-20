import { createAnthropic } from "@ai-sdk/anthropic";
import { wrapLanguageModel } from "ai";
import type { RequestData } from "../../types";

export function createAnthropicModel(
  llm: Extract<RequestData["llm"], { type: "anthropic" }>,
) {
  const anthropic = createAnthropic({
    baseURL: llm.baseURL,
    apiKey: llm.apiKey,
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
