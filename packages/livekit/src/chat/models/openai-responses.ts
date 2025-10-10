import {
  type OpenAIResponsesProviderOptions,
  createOpenAI,
} from "@ai-sdk/openai";
import { wrapLanguageModel } from "ai";
import type { RequestData } from "../../types";

export function createOpenAIResponsesModel(
  llm: Extract<RequestData["llm"], { type: "openai-responses" }>,
) {
  const openai = createOpenAI({
    baseURL: llm.baseURL,
    apiKey: llm.apiKey,
  });
  return wrapLanguageModel({
    model: openai.responses(llm.modelId),
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        params.maxOutputTokens = llm.maxOutputTokens;
        params.providerOptions = {
          openai: {
            reasoningSummary: "detailed",
          } satisfies OpenAIResponsesProviderOptions,
        };
        return params;
      },
    },
  });
}
