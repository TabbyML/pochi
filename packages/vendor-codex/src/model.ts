import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { EventSourceParserStream } from "@ai-sdk/provider-utils";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import { APICallError, wrapLanguageModel } from "ai";
import * as crypto from "node:crypto";
import { extractAccountId } from "./auth";
import {
  transformFromCodexFormat,
  transformToCodexFormat,
} from "./transformers";
import type { CodexCredentials } from "./types";

export function createCodexModel({
  modelId,
  getCredentials,
}: CreateModelOptions): LanguageModelV2 {
  const chatgptModel = createOpenAICompatible({
    name: "chatgpt",
    baseURL: "https://chatgpt.com/backend-api",
    apiKey: "placeholder",
    fetch: createPatchedFetch(
      modelId,
      getCredentials as () => Promise<CodexCredentials>,
    ) as typeof fetch,
  })(modelId);

  return wrapLanguageModel({
    model: chatgptModel,
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        return {
          ...params,
          model: "gpt-5",
          maxOutputTokens: 32768,
        };
      },
    },
  });
}

function createPatchedFetch(
  _model: string,
  getCredentials: () => Promise<CodexCredentials>,
) {
  return async (
    _requestInfo: Request | URL | string,
    requestInit?: RequestInit,
  ) => {
    const { accessToken } = await getCredentials();
    const headers = new Headers(requestInit?.headers);

    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }

    const accountId = extractAccountId(accessToken);
    headers.set("OpenAI-Beta", "responses=experimental");
    headers.set("session_id", crypto.randomUUID());
    headers.set("originator", "codex_cli_rs");

    if (accountId) {
      headers.set("chatgpt-account-id", accountId);
    }

    const request = JSON.parse((requestInit?.body as string) || "null");
    const transformedBody = transformToCodexFormat(request);

    const patchedRequestInit = {
      ...requestInit,
      headers,
      body: JSON.stringify(transformedBody),
    };

    const response = await fetch(
      "https://chatgpt.com/backend-api/codex/responses",
      patchedRequestInit,
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new APICallError({
        message: `Failed to fetch: ${response.status} ${response.statusText} - ${errorBody}`,
        statusCode: response.status,
        url: "",
        requestBodyValues: null,
      });
    }

    if (!response.body) {
      throw new APICallError({
        message: "No response body",
        statusCode: response.status,
        url: "",
        requestBodyValues: null,
      });
    }

    const body = response.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new EventSourceParserStream())
      .pipeThrough(
        new TransformStream({
          async transform({ data }, controller) {
            try {
              const item = JSON.parse(data);
              const openAIResponse = transformFromCodexFormat(item);
              const newChunk = `data: ${JSON.stringify(openAIResponse)}\r\n\r\n`;
              controller.enqueue(newChunk);
            } catch {
              // Ignore parse errors
            }
          },
        }),
      )
      .pipeThrough(new TextEncoderStream());

    return new Response(body, response);
  };
}
