import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import { APICallError, wrapLanguageModel } from "ai";
import type { QwenCoderCredentials } from "./types";

const BaseUrl = "https://portal.qwen.ai/v1";

const ModelIdMap: Record<string, string> = {
  "qwen-vl-max": "vision-model",
};

export function createQwenModel({
  modelId,
  getCredentials,
}: CreateModelOptions): LanguageModelV2 {
  const actualModelId = ModelIdMap[modelId] || modelId;
  const qwenModel = createOpenAICompatible({
    name: "OpenAI",
    baseURL: BaseUrl,
    fetch: createPatchedFetch(
      getCredentials as () => Promise<QwenCoderCredentials>,
    ),
  })(actualModelId);

  return wrapLanguageModel({
    model: qwenModel,
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        return {
          ...params,
          max_tokens: 8192,
        };
      },
    },
  });
}

function createPatchedFetch(
  getCredentials: () => Promise<QwenCoderCredentials>,
) {
  return async (
    requestInfo: Request | URL | string,
    requestInit?: RequestInit,
  ) => {
    const { access_token } = await getCredentials();
    const headers = new Headers(requestInit?.headers);
    headers.set("Authorization", `Bearer ${access_token}`);

    let finalUrl: string | URL | Request;

    // Check if CORS proxy is available (VSCode environment)
    if (globalThis.POCHI_CORS_PROXY_URL_PREFIX) {
      const url = new URL(
        globalThis.POCHI_CORS_PROXY_URL_PREFIX +
          encodeURIComponent(requestInfo.toString()),
      );
      finalUrl = url;
    } else {
      // CLI environment - make direct request
      finalUrl = requestInfo;
    }

    const resp = await fetch(finalUrl, {
      ...requestInit,
      headers,
    });

    if (!resp.ok) {
      throw new APICallError({
        message: `Failed to fetch: ${resp.status} ${resp.statusText}`,
        statusCode: resp.status,
        url:
          typeof requestInfo === "string"
            ? requestInfo
            : requestInfo.toString(),
        requestBodyValues: null,
      });
    }

    return resp;
  };
}
