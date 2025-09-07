import { APICallError, type LanguageModelV2 } from "@ai-sdk/provider";
import {
  EventSourceParserStream,
  extractResponseHeaders,
} from "@ai-sdk/provider-utils";
import type { PochiApi, PochiApiClient } from "@getpochi/common/pochi-api";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import { hc } from "hono/client";
import type { PochiCredentials } from "./types";

export function createPochiModel({
  id,
  modelId,
  getCredentials,
}: CreateModelOptions): LanguageModelV2 {
  return {
    specificationVersion: "v2",
    provider: "pochi",
    modelId: modelId || "<default>",
    // FIXME(meng): fill supported urls based on modelId.
    supportedUrls: {},
    doGenerate: async () => Promise.reject("Not implemented"),
    doStream: async ({ prompt, abortSignal, stopSequences, tools }) => {
      const apiClient = createApiClient(getCredentials);
      const data = {
        id,
        model: modelId,
        callOptions: {
          prompt,
          stopSequences,
          tools,
        },
      };
      const resp = await apiClient.api.chat.stream.$post(
        {
          json: data,
        },
        {
          init: {
            signal: abortSignal,
          },
        },
      );

      if (!resp.ok || !resp.body) {
        throw new APICallError({
          message: `Failed to fetch: ${resp.status} ${resp.statusText}`,
          statusCode: resp.status,
          url: apiClient.api.chat.stream.$url().toString(),
          requestBodyValues: data,
          responseHeaders: extractResponseHeaders(resp),
        });
      }

      const stream = resp.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream())
        .pipeThrough(
          new TransformStream({
            async transform({ data }, controller) {
              if (data === "[DONE]") {
                return;
              }
              controller.enqueue(JSON.parse(data));
            },
          }),
        );
      return { stream };
    },
  } satisfies LanguageModelV2;
}

function createApiClient(
  getCredentials: () => Promise<unknown>,
): PochiApiClient {
  const authClient: PochiApiClient = hc<PochiApi>(getServerBaseUrl(), {
    async fetch(input: string | URL | Request, init?: RequestInit) {
      const { token } = (await getCredentials()) as PochiCredentials;
      const headers = new Headers(init?.headers);
      headers.append("Authorization", `Bearer ${token}`);
      return fetch(input, {
        ...init,
        headers,
      });
    },
  });

  return authClient;
}
