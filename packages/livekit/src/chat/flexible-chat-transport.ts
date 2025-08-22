import type { Environment } from "@getpochi/common";
import { formatters, prompts } from "@getpochi/common";
import { type McpTool, selectClientTools } from "@getpochi/tools";
import type { Store } from "@livestore/livestore";
import {
  type ChatRequestOptions,
  type ChatTransport,
  type UIMessageChunk,
  convertToModelMessages,
  isToolUIPart,
} from "ai";
import type { Message, Metadata, RequestData } from "../types";
import { stepAgent } from "./llm";
import { parseMcpToolSet } from "./mcp-utils";
import {
  createNewTaskMiddleware,
  createReasoningMiddleware,
  createToolCallMiddleware,
} from "./middlewares";
import { createModel } from "./models";
import { persistManager } from "./persist-manager";

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
  getMcpToolSet?: () => Record<string, McpTool>;
};

export class FlexibleChatTransport implements ChatTransport<Message> {
  private readonly onStart?: OnStartCallback;
  private readonly getters: PrepareRequestGetters;
  private readonly isSubTask?: boolean;
  private readonly store: Store;

  constructor(options: {
    onStart?: OnStartCallback;
    getters: PrepareRequestGetters;
    isSubTask?: boolean;
    store: Store;
  }) {
    this.onStart = options.onStart;
    this.getters = options.getters;
    this.isSubTask = options.isSubTask;
    this.store = options.store;
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
    const mcpToolSet = this.getters.getMcpToolSet?.();

    await this.onStart?.({
      messages,
      environment,
      abortSignal,
      getters: this.getters,
    });

    const middlewares = [];

    if (!this.isSubTask) {
      middlewares.push(createNewTaskMiddleware(this.store, chatId));
    }

    if (isWellKnownReasoningModel(llm.modelId)) {
      middlewares.push(createReasoningMiddleware());
    }

    if (
      (llm.type === "pochi" &&
        // Turn on ToolCallMiddleware only for gemini backed models for now
        (llm.modelId?.startsWith("google/") ||
          llm.modelId?.startsWith("pochi/"))) ||
      (llm.type !== "pochi" && llm.useToolCallMiddleware) ||
      llm.type === "vscode"
    ) {
      middlewares.push(createToolCallMiddleware());
    }

    const mcpTools = mcpToolSet && parseMcpToolSet(mcpToolSet);
    const preparedMessages = await prepareMessages(messages, environment);
    const data = {
      system: prompts.system(environment?.info?.customRules),
      messages: convertToModelMessages(
        formatters.llm(preparedMessages, {
          keepReasoningPart:
            llm.type === "pochi" && llm.modelId?.includes("claude"),
        }),
      ),
      abortSignal,
      id: chatId,
      tools: {
        ...selectClientTools(!!this.isSubTask),
        ...(mcpTools || {}),
      },
      middlewares,
      environment,
    };
    return stepAgent(createModel({ id: chatId, llm }), data).toUIMessageStream({
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
      onFinish: async ({ messages }) => {
        if (llm.type === "pochi") {
          persistManager.push({
            taskId: chatId,
            store: this.store,
            messages,
            llm,
            environment,
          });
        }
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
