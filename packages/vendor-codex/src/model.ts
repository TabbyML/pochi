import * as crypto from "node:crypto";
import type {
  LanguageModelV2,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import { EventSourceParserStream } from "@ai-sdk/provider-utils";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import { APICallError } from "ai";
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

                processCodexChunk(chunk, controller, {
                  getCurrentTextId: () => currentTextId,
                  setCurrentTextId: (id) => { currentTextId = id; },
                  getCurrentToolId: () => currentToolId,
                  setCurrentToolId: (id) => { currentToolId = id; },
                });
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

interface StreamState {
  getCurrentTextId(): string | null;
  setCurrentTextId(id: string | null): void;
  getCurrentToolId(): string | null;
  setCurrentToolId(id: string | null): void;
}

interface CodexChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        id: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string;
  }>;
}

function processCodexChunk(
  chunk: unknown,
  controller: TransformStreamDefaultController<LanguageModelV2StreamPart>,
  state: StreamState,
): void {
  const codexChunk = chunk as CodexChunk;
  const choice = codexChunk.choices?.[0];

  if (!choice) return;

  switch (true) {
    case !!choice.delta?.content:
      if (choice.delta.content) {
        handleTextContent(choice.delta.content, controller, state);
      }
      break;

    case !!choice.delta?.tool_calls?.[0]:
      handleToolCall(choice.delta.tool_calls[0], controller, state);
      break;

    case !!choice.finish_reason:
      handleFinishReason(choice.finish_reason, controller, state);
      break;
  }
}

function handleTextContent(
  content: string,
  controller: TransformStreamDefaultController<LanguageModelV2StreamPart>,
  state: StreamState,
): void {
  if (!state.getCurrentTextId()) {
    const textId = `text-${Date.now()}`;
    state.setCurrentTextId(textId);
    controller.enqueue({
      type: "text-start",
      id: textId,
    });
  }

  const textId = state.getCurrentTextId();
  if (textId) {
    controller.enqueue({
      type: "text-delta",
      id: textId,
      delta: content,
    });
  }
}

function handleToolCall(
  toolCall: { id: string; function?: { name?: string; arguments?: string } },
  controller: TransformStreamDefaultController<LanguageModelV2StreamPart>,
  state: StreamState,
): void {
  // End text stream if active
  const currentTextId = state.getCurrentTextId();
  if (currentTextId) {
    controller.enqueue({
      type: "text-end",
      id: currentTextId,
    });
    state.setCurrentTextId(null);
  }

  const { function: fn } = toolCall;

  if (fn?.name && fn?.arguments) {
    // Complete tool call (from response.output_item.done)
    controller.enqueue({
      type: "tool-input-start",
      id: toolCall.id,
      toolName: fn.name,
    });
    controller.enqueue({
      type: "tool-input-delta",
      id: toolCall.id,
      delta: fn.arguments,
    });
    controller.enqueue({
      type: "tool-input-end",
      id: toolCall.id,
    });
  } else if (fn?.name) {
    // Start new tool call
    state.setCurrentToolId(toolCall.id);
    controller.enqueue({
      type: "tool-input-start",
      id: toolCall.id,
      toolName: fn.name,
    });
  } else if (fn?.arguments) {
    // Continue streaming tool arguments
    controller.enqueue({
      type: "tool-input-delta",
      id: state.getCurrentToolId() || toolCall.id,
      delta: fn.arguments,
    });
  }
}

function handleFinishReason(
  finishReason: string,
  controller: TransformStreamDefaultController<LanguageModelV2StreamPart>,
  state: StreamState,
): void {
  // End any active streams
  const currentTextId = state.getCurrentTextId();
  if (currentTextId) {
    controller.enqueue({
      type: "text-end",
      id: currentTextId,
    });
    state.setCurrentTextId(null);
  }

  const currentToolId = state.getCurrentToolId();
  if (currentToolId) {
    controller.enqueue({
      type: "tool-input-end",
      id: currentToolId,
    });
    state.setCurrentToolId(null);
  }

  // Map finish reasons
  const mappedReason = (() => {
    switch (finishReason) {
      case "stop": return "stop";
      case "length": return "length";
      case "tool_calls": return "tool-calls";
      default: return "unknown";
    }
  })();

  controller.enqueue({
    type: "finish",
    finishReason: mappedReason,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  });
}
