import { getErrorMessage } from "@ai-sdk/provider";
import type { Environment } from "@getpochi/common";
import { formatters, prompts } from "@getpochi/common";

import {
  type CustomAgent,
  type McpTool,
  overrideCustomAgentTools,
  selectClientTools,
} from "@getpochi/tools";
import type { Store } from "@livestore/livestore";
import {
  APICallError,
  type ChatRequestOptions,
  type ChatTransport,
  type UIMessageChunk,
  convertToModelMessages,
  isToolUIPart,
  streamText,
  wrapLanguageModel,
} from "ai";
import { pickBy } from "remeda";
import type { Message, Metadata, RequestData } from "../types";
import { makeRepairToolCall } from "./llm";
import { parseMcpToolSet } from "./mcp-utils";
import {
  createNewTaskMiddleware,
  createReasoningMiddleware,
  createToolCallMiddleware,
} from "./middlewares";
import { createModel } from "./models";

export type OnStartCallback = (options: {
  messages: Message[];
  environment?: Environment;
  abortSignal?: AbortSignal;
  getters: PrepareRequestGetters;
}) => void;

export type PrepareRequestGetters = {
  getLLM: () => RequestData["llm"];
  getEnvironment?: (options: {
    readonly messages: Message[];
  }) => Promise<Environment>;
  getMcpInfo?: () => {
    toolset: Record<string, McpTool>;
    instructions: string;
  };
  getCustomAgents?: () => CustomAgent[] | undefined;
};

export type ChatTransportOptions = {
  onStart?: OnStartCallback;
  getters: PrepareRequestGetters;
  isSubTask?: boolean;
  isCli?: boolean;
  store: Store;
  customAgent?: CustomAgent;
  cwd: string;
};

export class FlexibleChatTransport implements ChatTransport<Message> {
  private readonly onStart?: OnStartCallback;
  private readonly getters: PrepareRequestGetters;
  private readonly isSubTask?: boolean;
  private readonly isCli?: boolean;
  private readonly store: Store;
  private readonly customAgent?: CustomAgent;
  private readonly cwd: string;

  constructor(options: ChatTransportOptions) {
    this.onStart = options.onStart;
    this.getters = options.getters;
    this.isSubTask = options.isSubTask;
    this.isCli = options.isCli;
    this.store = options.store;
    this.customAgent = overrideCustomAgentTools(options.customAgent);
    this.cwd = options.cwd;
  }

  sendMessages: (
    options: {
      trigger: "submit-message" | "regenerate-message";
      chatId: string;
      messageId: string | undefined;
      messages: Message[];
      abortSignal: AbortSignal | undefined;
    } & ChatRequestOptions,
  ) => Promise<ReadableStream<UIMessageChunk>> = async ({
    chatId,
    messages,
    abortSignal,
  }) => {
    const llm = await this.getters.getLLM();
    const environment = await this.getters.getEnvironment?.({ messages });
    const mcpInfo = this.getters.getMcpInfo?.();
    const customAgents = this.getters.getCustomAgents?.();

    await this.onStart?.({
      messages,
      environment,
      abortSignal,
      getters: this.getters,
    });

    const middlewares = [];

    if (!this.isSubTask) {
      middlewares.push(
        createNewTaskMiddleware(this.store, this.cwd, chatId, customAgents),
      );
    }

    if ("modelId" in llm && isWellKnownReasoningModel(llm.modelId)) {
      middlewares.push(createReasoningMiddleware());
    }

    if (llm.useToolCallMiddleware) {
      middlewares.push(createToolCallMiddleware());
    }

    const mcpTools = mcpInfo?.toolset && parseMcpToolSet(mcpInfo.toolset);
    const tools = pickBy(
      {
        ...selectClientTools({
          isSubTask: !!this.isSubTask,
          isCli: !!this.isCli,
          customAgents,
        }),
        ...(mcpTools || {}),
      },
      (_val, key) => {
        if (this.customAgent?.tools) {
          return this.customAgent.tools.includes(key);
        }
        return true;
      },
    );

    const preparedMessages = await prepareMessages(messages, environment);
    const model = createModel({ id: chatId, llm });
    const stream = streamText({
      system: prompts.system(
        environment?.info?.customRules,
        this.customAgent,
        mcpInfo?.instructions,
      ),
      messages: convertToModelMessages(
        formatters.llm(preparedMessages, {
          keepReasoningPart: llm.type === "vendor" && llm.keepReasoningPart,
        }),
        // toModelOutput is invoked within convertToModelMessages, thus we need to pass the tools here.
        { tools },
      ),
      model: wrapLanguageModel({
        model,
        middleware: middlewares,
      }),
      abortSignal,
      tools,
      maxRetries: 0,
      // error log is handled in live chat kit.
      onError: () => {},
      experimental_repairToolCall: makeRepairToolCall(model),
    });
    return stream.toUIMessageStream({
      onError: (error) => {
        if (APICallError.isInstance(error)) {
          // throw error so we can handle it on Chat class onError
          throw error;
        }
        return getErrorMessage(error);
      },
      originalMessages: preparedMessages,
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
      onFinish: async () => {
        // DO NOTHING
      },
    });
  };

  reconnectToStream: (
    options: { chatId: string } & ChatRequestOptions,
  ) => Promise<ReadableStream<UIMessageChunk> | null> = async () => {
    return null;
  };
}

function prepareMessages<T extends import("ai").UIMessage>(
  inputMessages: T[],
  environment: Environment | undefined,
): T[] {
  return prompts.injectEnvironment(inputMessages, environment) as T[];
}

function isWellKnownReasoningModel(model?: string): boolean {
  if (!model) return false;

  const models = [/glm-4.5/, /qwen3.*thinking/];
  const x = model.toLowerCase();
  for (const m of models) {
    if (x.match(m)?.length) {
      return true;
    }
  }
  return false;
}

function estimateTotalTokens(messages: Message[]): number {
  let totalTextLength = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "text") {
        totalTextLength += part.text.length;
      } else if (isToolUIPart(part)) {
        totalTextLength += JSON.stringify(part).length;
      }
    }
  }
  return Math.ceil(totalTextLength / 4);
}
