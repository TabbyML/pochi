import type { Environment } from "@getpochi/common";
import { prompts } from "@getpochi/common";
import { type McpTool, selectClientTools } from "@getpochi/tools";
import type { Store } from "@livestore/livestore";
import type { ChatRequestOptions, ChatTransport, UIMessageChunk } from "ai";
import type { Message, RequestData } from "../types";
import { requestLLM } from "./llm";
import { parseMcpToolSet } from "./llm/utils";
import {
  createNewTaskMiddleware,
  createReasoningMiddleware,
  createToolCallMiddleware,
} from "./middlewares";

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

    // middlewares.push(createBatchCallMiddleware());

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

    const system = prompts.system(environment?.info?.customRules);
    const mcpTools = mcpToolSet && parseMcpToolSet(mcpToolSet);
    const tools = {
      ...selectClientTools(!!this.isSubTask),
      ...(mcpTools || {}),
    };
    return requestLLM(this.store, llm, {
      system,
      messages: prepareMessages(messages, environment),
      abortSignal,
      id: chatId,
      tools,
      middlewares,
      environment,
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
