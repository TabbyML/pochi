import {
  type ModelMessage,
  type Tool,
  streamText,
  wrapLanguageModel,
} from "ai";

import type {
  LanguageModelV2,
  LanguageModelV2Middleware,
} from "@ai-sdk/provider";
import type { Environment } from "@getpochi/common";
import { makeRepairToolCall } from "./repair-tool-call";

export function stepAgent(
  model: LanguageModelV2,
  data: {
    id?: string;
    system?: string;
    abortSignal?: AbortSignal;
    messages: ModelMessage[];
    tools?: Record<string, Tool>;
    middlewares?: LanguageModelV2Middleware[];
    environment?: Environment;
  },
) {
  const tools = data.tools;
  const result = streamText({
    model: wrapLanguageModel({
      model,
      middleware: data.middlewares || [],
    }),
    abortSignal: data.abortSignal,
    system: data.system,
    messages: data.messages,
    tools,
    maxRetries: 0,
    // error log is handled in live chat kit.
    onError: () => {},
    experimental_repairToolCall: makeRepairToolCall(model),
  });
  return result;
}
