import { wrapLanguageModel } from "ai";
import {
  type GoogleCloudCodeProviderSettings,
  createGoogleCloudCode,
} from "cloud-code-ai-provider";
import type { RequestData } from "../../types";

export function createVendorModel(
  llm: Extract<RequestData["llm"], { type: "vendor" }>,
) {
  if (!llm.credentials) {
    throw new Error(`Missing credentials for ${llm.vendorId}`);
  }

  return wrapLanguageModel({
    model: createModel(llm.vendorId, llm.credentials, llm.modelId),
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        params.maxOutputTokens = llm.maxOutputTokens;
        return params;
      },
    },
  });
}

function createModel(vendorId: string, credentials: unknown, modelId: string) {
  if (vendorId === "gemini-cli") {
    return createGoogleCloudCode({
      credentials:
        credentials as GoogleCloudCodeProviderSettings["credentials"],
    })(modelId);
  }

  throw new Error(`Unknown vendor: ${vendorId}`);
}
