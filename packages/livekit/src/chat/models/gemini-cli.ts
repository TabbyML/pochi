import { wrapLanguageModel } from "ai";
import { createGoogleCloudCode } from "cloud-code-ai-provider";
import type { RequestData } from "../../types";

export function createGeminiCliModel(
  llm: Extract<RequestData["llm"], { type: "gemini-cli" }>,
) {
  if (!llm.credentials) {
    throw new Error("Missing credentials for gemini-cli");
  }

  const cloudCode = createGoogleCloudCode({
    credentials: {
      access_token: llm.credentials.accessToken,
      refresh_token: llm.credentials.refreshToken,
      expiry_date: llm.credentials.expiresAt,
    },
  });

  return wrapLanguageModel({
    model: cloudCode(llm.modelId),
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        params.maxOutputTokens = llm.maxOutputTokens;
        return params;
      },
    },
  });
}
