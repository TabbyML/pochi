import {
  APICallError,
  type LanguageModelV2,
  type LanguageModelV2Prompt,
} from "@ai-sdk/provider";
import {
  EventSourceParserStream,
  convertToBase64,
} from "@ai-sdk/provider-utils";
import { constants, PochiProviderOptions } from "@getpochi/common";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import {
  type PochiCredentials,
  getServerBaseUrl,
} from "@getpochi/common/vscode-webui-bridge";
import { hc } from "hono/client";
import type { PochiApi, PochiApiClient } from "./pochi-api";

export function createPochiModel({
  modelId,
  getCredentials,
}: CreateModelOptions): LanguageModelV2 {
  return {
    specificationVersion: "v2",
    provider: "pochi",
    modelId: modelId || "<default>",
    // FIXME(meng): fill supported urls based on modelId.
    supportedUrls: {},
    doGenerate: async ({
      abortSignal,
      prompt,
      providerOptions,
      ...options
    }) => {
      const headers: Record<string, string> = {};
      const parsedOptions = PochiProviderOptions.safeParse(
        providerOptions?.pochi,
      );
      if (parsedOptions.success) {
        headers[constants.PochiTaskIdHeader] = parsedOptions.data.taskId;
        headers[constants.PochiClientHeader] = parsedOptions.data.client;
        headers[constants.PochiRequestUseCaseHeader] =
          parsedOptions.data.useCase;
      }

      const apiClient = createApiClient(getCredentials);
      const resp = await apiClient.api.chat.$post(
        {
          json: {
            model: modelId,
            options: {
              prompt: convertFilePartDataToBase64(prompt),
              ...options,
            },
          },
        },
        {
          headers,
          init: {
            signal: abortSignal,
          },
        },
      );
      const data = (await resp.json()) as Awaited<
        ReturnType<LanguageModelV2["doGenerate"]>
      >;
      return data;
    },
    doStream: async ({
      prompt,
      abortSignal,
      stopSequences,
      tools,
      providerOptions,
    }) => {
      const apiClient = createApiClient(getCredentials);
      const headers: Record<string, string> = {};
      const parsedOptions = PochiProviderOptions.safeParse(
        providerOptions?.pochi,
      );
      if (parsedOptions.success) {
        headers[constants.PochiTaskIdHeader] = parsedOptions.data.taskId;
        headers[constants.PochiClientHeader] = parsedOptions.data.client;
        headers[constants.PochiRequestUseCaseHeader] =
          parsedOptions.data.useCase;
      }

      const data = {
        model: modelId,
        callOptions: {
          prompt: convertFilePartDataToBase64(prompt),
          stopSequences,
          tools,
        },
      };
      const resp = await apiClient.api.chat.stream.$post(
        {
          json: data,
        },
        {
          headers,
          init: {
            signal: abortSignal,
          },
        },
      );

      if (!resp.ok || !resp.body) {
        // Convert Hono ClientResponse headers to standard Headers format
        const responseHeaders: Record<string, string> = {};
        resp.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        throw new APICallError({
          message: `Failed to fetch: ${resp.status} ${resp.statusText}`,
          statusCode: resp.status,
          url: apiClient.api.chat.stream.$url().toString(),
          requestBodyValues: data,
          responseHeaders,
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
  const apiClient: PochiApiClient = hc<PochiApi>(getServerBaseUrl(), {
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

  return apiClient;
}

function convertFilePartDataToBase64(
  prompt: LanguageModelV2Prompt,
): LanguageModelV2Prompt {
  return prompt.map((message) => {
    if (message.role === "system") {
      return message;
    }
    return {
      ...message,
      content: message.content.map((part) => {
        if (part.type === "file" && part.data instanceof Uint8Array) {
          return {
            ...part,
            data: convertToBase64(part.data),
          };
        }
        return part;
      }),
    };
  }) as LanguageModelV2Prompt;
}
