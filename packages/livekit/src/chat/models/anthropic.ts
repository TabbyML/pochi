import { createAnthropic } from "@ai-sdk/anthropic";
import { fetchWithCorsProxy } from "@getpochi/common/fetch-utils";
import { wrapLanguageModel } from "ai";
import type { RequestData } from "../../types";
import { PochiSessionIdHeader } from "./constants";

export function createAnthropicModel(
  llm: Extract<RequestData["llm"], { type: "anthropic" }>,
  taskId: string,
) {
  const anthropic = createAnthropic({
    baseURL: llm.baseURL,
    apiKey: llm.apiKey,
    headers: { [PochiSessionIdHeader]: taskId },
    fetch: fetchWithCorsProxy,
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
