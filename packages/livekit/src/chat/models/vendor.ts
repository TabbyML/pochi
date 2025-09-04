import type { LanguageModelV2 } from "@ai-sdk/provider";
import { wrapLanguageModel } from "ai";
// import {
//   type GoogleCloudCodeProviderSettings,
//   createGoogleCloudCode,
// } from "cloud-code-ai-provider";
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
        params.maxOutputTokens = llm.options.maxOutputTokens;
        return params;
      },
    },
  });
}

function createModel(
  vendorId: string,
  _credentials: unknown,
  _modelId: string,
): LanguageModelV2 {
  // FIXME(meng): this would add cloud-code-ai-provider dependency,
  //  and it has issues running in browser env which would break the vscode-webui build.
  //
  // if (vendorId === "gemini-cli") {
  //   return createGoogleCloudCode({
  //     credentials:
  //       credentials as GoogleCloudCodeProviderSettings["credentials"],
  //   })(modelId);
  // }

  throw new Error(`Unknown vendor: ${vendorId}`);
}
