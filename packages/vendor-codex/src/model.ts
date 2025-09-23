import type { LanguageModelV2, LanguageModelV2StreamPart } from "@ai-sdk/provider";
import { EventSourceParserStream } from "@ai-sdk/provider-utils";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import { APICallError } from "ai";
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
  return {
    specificationVersion: "v2",
    provider: "codex",
    modelId: modelId || "gpt-5",
    supportedUrls: {},
    doGenerate: async () => Promise.reject("Not implemented"),
    doStream: async ({ prompt, abortSignal, tools, toolChoice }) => {
      const { accessToken } =
        await (getCredentials() as Promise<CodexCredentials>);

      const request = {
        model: modelId || "gpt-5",
        messages: prompt,
        tools,
        toolChoice,
        maxTokens: 32768,
        stream: true,
      };

      const transformedBody = transformToCodexFormat(request);

      const headers = new Headers();
      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }

      const accountId = extractAccountId(accessToken);
      headers.set("OpenAI-Beta", "responses=experimental");
      headers.set("session_id", crypto.randomUUID());
      headers.set("originator", "codex_cli_rs");
      headers.set("Content-Type", "application/json");

      if (accountId) {
        headers.set("chatgpt-account-id", accountId);
      }

      const response = await fetch(
        "https://chatgpt.com/backend-api/codex/responses",
        {
          method: "POST",
          headers,
          body: JSON.stringify(transformedBody),
          signal: abortSignal,
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new APICallError({
          message: `Failed to fetch: ${response.status} ${response.statusText} - ${errorBody}`,
          statusCode: response.status,
          url: "https://chatgpt.com/backend-api/codex/responses",
          requestBodyValues: transformedBody,
        });
      }

      if (!response.body) {
        throw new APICallError({
          message: "No response body",
          statusCode: response.status,
          url: "https://chatgpt.com/backend-api/codex/responses",
          requestBodyValues: transformedBody,
        });
      }

      let currentTextId: string | null = null;
      let currentToolId: string | null = null;

      const stream = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new EventSourceParserStream())
        .pipeThrough(
          new TransformStream<{ data: string }, LanguageModelV2StreamPart>({
            async transform({ data }, controller) {
              try {
                const item = JSON.parse(data);
                const chunk = transformFromCodexFormat(item);

                // Transform the OpenAI-like response to LanguageModelV2StreamPart
                const choices = (chunk as { choices?: Array<{ delta?: { content?: string; tool_calls?: Array<{ id: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string }> }).choices;

                if (choices?.[0]?.delta?.content) {
                  // Start text stream if not already started
                  if (!currentTextId) {
                    currentTextId = `text-${Date.now()}`;
                    controller.enqueue({
                      type: "text-start",
                      id: currentTextId,
                    });
                  }
                  controller.enqueue({
                    type: "text-delta",
                    id: currentTextId,
                    delta: choices[0].delta.content,
                  });
                } else if (choices?.[0]?.delta?.tool_calls?.[0]) {
                  // End text stream if it was started
                  if (currentTextId) {
                    controller.enqueue({
                      type: "text-end",
                      id: currentTextId,
                    });
                    currentTextId = null;
                  }

                  const toolCall = choices[0].delta.tool_calls[0];
                  if (toolCall.function?.name && toolCall.function?.arguments) {
                    // This is the complete tool call from response.output_item.done
                    currentToolId = toolCall.id;
                    controller.enqueue({
                      type: "tool-input-start",
                      id: toolCall.id,
                      toolName: toolCall.function.name,
                    });
                    controller.enqueue({
                      type: "tool-input-delta",
                      id: toolCall.id,
                      delta: toolCall.function.arguments,
                    });
                    controller.enqueue({
                      type: "tool-input-end",
                      id: toolCall.id,
                    });
                    currentToolId = null;
                  } else if (toolCall.function?.name) {
                    // Start a new tool call
                    currentToolId = toolCall.id;
                    controller.enqueue({
                      type: "tool-input-start",
                      id: toolCall.id,
                      toolName: toolCall.function.name,
                    });
                  } else if (toolCall.function?.arguments) {
                    // Continue streaming tool arguments
                    controller.enqueue({
                      type: "tool-input-delta",
                      id: currentToolId || toolCall.id,
                      delta: toolCall.function.arguments,
                    });
                  }
                } else if (choices?.[0]?.finish_reason) {
                  // End any active text stream
                  if (currentTextId) {
                    controller.enqueue({
                      type: "text-end",
                      id: currentTextId,
                    });
                    currentTextId = null;
                  }
                  // End any active tool call
                  if (currentToolId) {
                    controller.enqueue({
                      type: "tool-input-end",
                      id: currentToolId,
                    });
                    currentToolId = null;
                  }
                  controller.enqueue({
                    type: "finish",
                    finishReason: choices[0].finish_reason === "stop" ? "stop" :
                                 choices[0].finish_reason === "length" ? "length" :
                                 choices[0].finish_reason === "tool_calls" ? "tool-calls" :
                                 "unknown",
                    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, // Would need proper token tracking
                  });
                }
              } catch (error) {
                // Log error but don't break the stream
                console.error("Error parsing Codex response:", error);
              }
            },
          }),
        );

      return { stream };
    },
  } satisfies LanguageModelV2;
}
