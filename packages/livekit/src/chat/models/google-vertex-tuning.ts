import type { GoogleGenerativeAIProviderOptions } from "@ai-sdk/google";
import { createVertexModel } from "@getpochi/common/google-vertex-utils";
import { wrapLanguageModel } from "ai";
import type { RequestData } from "../../types";

export function createGoogleVertexTuningModel(
  llm: Extract<RequestData["llm"], { type: "google-vertex-tuning" }>,
) {
  const vertexModel = createVertexModel(llm.vertex, llm.modelId);

  return wrapLanguageModel({
    model: vertexModel,
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        return {
          ...params,
          maxOutputTokens: params.maxOutputTokens,
          providerOptions: {
            google: {
              thinkingConfig: {
                includeThoughts: true,
                thinkingBudget: 4096,
              },
            } satisfies GoogleGenerativeAIProviderOptions,
          },
        };
      },
    },
  });
}
