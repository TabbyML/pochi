import { createGatewayProvider } from "@ai-sdk/gateway";
import { wrapLanguageModel } from "ai";
import type { RequestData } from "../../types";

export function createAiGatewayModel(
  llm: Extract<RequestData["llm"], { type: "ai-gateway" }>,
) {
  const gateway = createGatewayProvider({
    apiKey: llm.apiKey,
  });

  return wrapLanguageModel({
    model: gateway(llm.modelId),
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        params.maxOutputTokens = llm.maxOutputTokens;
        return params;
      },
    },
  });
}
