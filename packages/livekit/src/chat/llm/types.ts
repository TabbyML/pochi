import type { LanguageModelV2Middleware } from "@ai-sdk/provider";
import type { Environment } from "@getpochi/common";
import type { Tool } from "ai";
import type { Message } from "../../types";

export type LLMRequest = {
  id?: string;
  system?: string;
  abortSignal?: AbortSignal;
  messages: Message[];
  tools?: Record<string, Tool>;
  middlewares?: LanguageModelV2Middleware[];
  environment?: Environment;
};

export type OnFinishCallback = (data: {
  messages: Message[];
}) => PromiseLike<void>;
