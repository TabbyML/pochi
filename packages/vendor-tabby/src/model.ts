import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import { APICallError, wrapLanguageModel } from "ai";
import type { TabbyCredentials } from "./types";

export function createTabbyModel({
  modelId,
  getCredentials,
}: CreateModelOptions): LanguageModelV2 {
  const tabbyModel = createOpenAICompatible({
    name: "Tabby",
    baseURL: "http://placeholder.local/v1", // Will be replaced by custom fetch
    fetch: createPatchedFetch(
      getCredentials as () => Promise<TabbyCredentials>,
    ),
  })(modelId);

  return wrapLanguageModel({
    model: tabbyModel,
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        // Transform max_tokens to max_completion_tokens for newer models
        const { maxOutputTokens, ...rest } = params;
        return {
          ...rest,
          maxCompletionTokens: maxOutputTokens,
        };
      },
    },
  });
}

function createPatchedFetch(getCredentials: () => Promise<TabbyCredentials>) {
  return async (
    requestInfo: Request | URL | string,
    requestInit?: RequestInit,
  ) => {
    const credentials = await getCredentials();
    const baseUrl = credentials.url;
    const token = credentials.token;

    // Extract the path from the placeholder URL and construct new URL with Tabby's base
    const originalUrl =
      typeof requestInfo === "string"
        ? new URL(requestInfo)
        : requestInfo instanceof URL
          ? requestInfo
          : new URL(requestInfo.url);

    // Replace placeholder URL with Tabby's endpoint
    // Original: http://placeholder.local/v1/chat/completions
    // Target:   {baseUrl}/v2/endpoints/oai/v1/chat/completions
    const tabbyUrl = new URL(
      `/v2/endpoints/oai${originalUrl.pathname}`,
      baseUrl,
    );

    const headers = new Headers(requestInit?.headers);
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    headers.set("Content-Type", "application/json");

    const resp = await fetch(tabbyUrl, {
      ...requestInit,
      headers,
    });

    if (!resp.ok) {
      const responseHeaders: Record<string, string> = {};
      resp.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      let message = `Failed to fetch: ${resp.status} ${resp.statusText}`;

      if (resp.status >= 400 && resp.status < 600) {
        try {
          const errorMessage = await resp.text();
          if (errorMessage) {
            message = errorMessage;
          }
        } catch {
          // Ignore error reading body
        }
      }

      throw new APICallError({
        message,
        statusCode: resp.status,
        url: tabbyUrl.toString(),
        requestBodyValues: null,
        responseHeaders,
      });
    }

    return resp;
  };
}
