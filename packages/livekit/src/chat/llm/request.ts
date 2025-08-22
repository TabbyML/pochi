import {
  type ModelMessage,
  type UIMessage,
  convertToModelMessages,
  streamText,
  wrapLanguageModel,
} from "ai";

import type { LanguageModelV2 } from "@ai-sdk/provider";
import { type LLMFormatterOptions, formatters } from "@getpochi/common";
import type { Message, Metadata } from "../../types";
import { makeRepairToolCall } from "./repair-tool-call";
import type { LLMRequest, OnFinishCallback } from "./types";

export async function request(
  model: LanguageModelV2,
  payload: LLMRequest,
  formatterOptions?: LLMFormatterOptions,
  onFinish?: OnFinishCallback,
) {
  const tools = payload.tools;
  const messages = convertToModelMessages(
    formatters.llm(payload.messages, formatterOptions),
    {
      tools,
    },
  );

  const result = streamText({
    model: wrapLanguageModel({
      model,
      middleware: payload.middlewares || [],
    }),
    abortSignal: payload.abortSignal,
    system: payload.system,
    messages,
    tools,
    maxRetries: 0,
    // error log is handled in live chat kit.
    onError: () => {},
    experimental_repairToolCall: makeRepairToolCall(model),
  });
  return result.toUIMessageStream({
    originalMessages: payload.messages as UIMessage[],
    messageMetadata: ({ part }) => {
      if (part.type === "finish") {
        return {
          kind: "assistant",
          totalTokens:
            part.totalUsage.totalTokens || estimateTotalTokens(messages),
          finishReason: part.finishReason,
        } satisfies Metadata;
      }
    },
    onFinish: async ({ messages }) => {
      await onFinish?.({
        messages: messages as Message[],
      });
    },
  });
}

function estimateTotalTokens(messages: ModelMessage[]): number {
  let totalTextLength = 0;
  for (const message of messages) {
    if (typeof message.content === "string") {
      totalTextLength += message.content.length;
    } else {
      for (const part of message.content) {
        switch (part.type) {
          case "text":
            totalTextLength += part.text.length;
            break;
          case "tool-call":
          case "tool-result":
            totalTextLength += JSON.stringify(part).length;
            break;
          default:
            break;
        }
      }
    }
  }
  return Math.ceil(totalTextLength / 4);
}
