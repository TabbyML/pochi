import { APICallError, type LanguageModelV2 } from "@ai-sdk/provider";
import {
  EventSourceParserStream,
  extractResponseHeaders,
} from "@ai-sdk/provider-utils";
import type { PochiApiClient } from "@getpochi/common/pochi-api";

export function createPochiModel(
  id: string,
  modelId: string,
  apiClient: PochiApiClient,
) {
  return {
    specificationVersion: "v2",
    provider: "pochi",
    modelId: modelId || "<default>",
    // FIXME(meng): fill supported urls based on modelId.
    supportedUrls: {},
    doGenerate: async () => Promise.reject("Not implemented"),
    doStream: async ({ prompt, abortSignal, stopSequences, tools }) => {
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
