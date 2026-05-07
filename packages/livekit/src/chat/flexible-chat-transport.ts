import { getErrorMessage } from "@ai-sdk/provider";
import type {
  AutoMemoryContext,
  Environment,
  MessageCacheBreakpoint,
  PochiProviderOptions,
  PochiRequestUseCase,
} from "@getpochi/common";
import { formatters, prompts } from "@getpochi/common";
import * as R from "remeda";

import {
  type ClientTools,
  type CustomAgent,
  type McpTool,
  type Skill,
  selectAgentTools,
} from "@getpochi/tools";
import {
  APICallError,
  type ChatRequestOptions,
  type ChatTransport,
  type ModelMessage,
  type SystemModelMessage,
  type UIMessageChunk,
  convertToModelMessages,
  isStaticToolUIPart,
  streamText,
  tool,
  wrapLanguageModel,
} from "ai";
import type z from "zod";
import type { BlobStore } from "../blob-store";
import { findBlob, makeDownloadFunction } from "../store-blob";
import type { LiveKitStore, Message, Metadata, RequestData } from "../types";
import { makeRepairToolCall } from "./llm";
import { parseMcpToolSet } from "./mcp-utils";
import {
  createNewTaskMiddleware,
  createReasoningMiddleware,
  createToolCallMiddleware,
} from "./middlewares";
import { createOutputSchemaMiddleware } from "./middlewares/output-schema-middleware";
import { createModel } from "./models";
import { ImageEstimatedTokens, estimateTokens } from "./token-utils";

export type OnStartCallback = (options: {
  messages: Message[];
  environment?: Environment;
  abortSignal?: AbortSignal;
  getters: PrepareRequestGetters;
}) => void;

export type PrepareRequestGetters = {
  getLLM: () => RequestData["llm"];
  getEnvironment?: () => Promise<Environment>;
  getAutoMemory?: () => Promise<AutoMemoryContext | undefined>;
  getMcpInfo?: () => {
    toolset: Record<string, McpTool>;
    instructions: string;
  };
  getCustomAgents?: () => CustomAgent[] | undefined;
  getSkills?: () => Skill[] | undefined;
};

export type ChatTransportOptions = {
  onStart?: OnStartCallback;
  getters: PrepareRequestGetters;
  isSubTask?: boolean;
  messageCacheBreakpoint?: MessageCacheBreakpoint;
  requestUseCase?: PochiRequestUseCase;
  store: LiveKitStore;
  blobStore: BlobStore;
  customAgent?: CustomAgent;
  outputSchema?: z.ZodAny;
  attemptCompletionSchema?: z.ZodAny;
};

export class FlexibleChatTransport implements ChatTransport<Message> {
  private readonly onStart?: OnStartCallback;
  private readonly getters: PrepareRequestGetters;
  private readonly isSubTask?: boolean;
  private readonly messageCacheBreakpoint: MessageCacheBreakpoint;
  private readonly requestUseCase: PochiRequestUseCase;
  private readonly store: LiveKitStore;
  private readonly blobStore: BlobStore;
  private readonly customAgent?: CustomAgent;
  private readonly outputSchema?: z.ZodAny;
  private readonly attemptCompletionSchema?: z.ZodAny;

  constructor(options: ChatTransportOptions) {
    this.onStart = options.onStart;

    this.getters = options.getters;
    this.isSubTask = options.isSubTask;
    this.messageCacheBreakpoint = options.messageCacheBreakpoint ?? "last";
    this.requestUseCase = options.requestUseCase ?? "agent";
    this.store = options.store;
    this.blobStore = options.blobStore;
    this.customAgent = options.customAgent;
    this.outputSchema = options.outputSchema;
    this.attemptCompletionSchema = options.attemptCompletionSchema;
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
    const environment = await this.getters.getEnvironment?.();
    const autoMemory = await this.getters.getAutoMemory?.();
    messages = prompts.injectEnvironment(messages, environment) as Message[];
    messages = prompts.injectAutoMemory(messages, autoMemory) as Message[];
    const mcpInfo = this.getters.getMcpInfo?.();
    const customAgents = this.getters.getCustomAgents?.();
    const skills = this.getters.getSkills?.();

    await this.onStart?.({
      messages,
      environment,
      abortSignal,
      getters: this.getters,
    });

    const model = createModel({ llm });
    const middlewares = [];

    if (!this.isSubTask) {
      middlewares.push(
        createNewTaskMiddleware(
          this.store,
          environment?.info.cwd,
          chatId,
          customAgents,
        ),
      );
    }

    if ("modelId" in llm && isWellKnownReasoningModel(llm.modelId)) {
      middlewares.push(createReasoningMiddleware());
    }

    if (this.outputSchema) {
      middlewares.push(
        createOutputSchemaMiddleware(chatId, model, this.outputSchema),
      );
    }

    if (llm.useToolCallMiddleware) {
      middlewares.push(
        createToolCallMiddleware(llm.type !== "google-vertex-tuning"),
      );
    }

    const mcpTools =
      mcpInfo?.toolset && parseMcpToolSet(this.blobStore, mcpInfo.toolset);

    // Tool ordering should be deterministic
    const tools = selectAgentTools({
      agent: this.customAgent,
      isSubTask: !!this.isSubTask,
      customAgents,
      contentType: llm.contentType,
      skills,
      attemptCompletionSchema: this.attemptCompletionSchema,
      mcpTools,
    });
    if (tools.readFile) {
      tools.readFile = handleReadFileOutput(this.blobStore, tools.readFile);
    }

    const systemPrompt = prompts.system(
      environment?.info?.customRules,
      this.customAgent,
      mcpInfo?.instructions,
      autoMemory,
    );
    const systemPromptChars = systemPrompt.length;
    const toolsChars = JSON.stringify(tools).length;
    const systemPromptTokens = Math.ceil(systemPromptChars / 4);
    const toolsTokens = Math.ceil(toolsChars / 4);

    const preparedMessages = await prepareMessages(messages);
    const modelMessages = (await resolvePromise(
      await convertToModelMessages(
        formatters.llm(preparedMessages),
        // toModelOutput is invoked within convertToModelMessages, thus we need to pass the tools here.
        { tools },
      ),
    )) as ModelMessage[];

    // Mark cache breakpoints for Anthropic prompt caching. The provider order
    // is `tools → system → messages`, so a breakpoint on the system block
    // caches both tools and system, and a breakpoint on the last message
    // caches the entire prefix up to (and including) that message.
    const cacheControl = {
      anthropic: { cacheControl: { type: "ephemeral" } },
    } as const;

    const systemMessage: SystemModelMessage = {
      role: "system",
      content: systemPrompt,
      providerOptions: cacheControl,
    };

    const cachedModelMessages = withMessageCacheBreakpoint(
      modelMessages,
      this.messageCacheBreakpoint,
    );

    const stream = streamText({
      providerOptions: {
        pochi: {
          taskId: chatId,
          client: globalThis.POCHI_CLIENT,
          useCase: this.requestUseCase,
        } satisfies PochiProviderOptions,
      },
      system: systemMessage,
      messages: cachedModelMessages,
      model: wrapLanguageModel({
        model,
        middleware: middlewares,
      }),
      abortSignal,
      tools,
      maxRetries: 0,
      // error log is handled in live chat kit.
      onError: () => {},
      experimental_repairToolCall: makeRepairToolCall(chatId, model),
      experimental_download: makeDownloadFunction(this.blobStore),
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
            // The client only consumes the aggregated total token count here.
            // Detailed usage shape differences are a server/protocol concern.
            totalTokens:
              part.totalUsage.totalTokens || estimateTotalTokens(messages),
            finishReason: part.finishReason,
            systemPromptTokens,
            toolsTokens,
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

function prepareMessages(inputMessages: Message[]): Message[] {
  return convertDataReviewsToText(inputMessages);
}

/**
 * Attach an Anthropic ephemeral cache breakpoint to a message in the
 * conversation. Combined with a breakpoint on the system block, this caches
 * the request prefix (tools + system + message history) up to the selected
 * boundary. On the next request that adds new messages, the previous boundary
 * becomes a cache hit.
 *
 * Fork agents select the second-to-last message because their final message is
 * a fresh directive, while the reusable parent-task prefix ends immediately
 * before it.
 */
export function withMessageCacheBreakpoint(
  messages: ModelMessage[],
  breakpoint: MessageCacheBreakpoint,
): ModelMessage[] {
  if (messages.length === 0) return messages;
  const cacheIndex =
    breakpoint === "secondLast" ? messages.length - 2 : messages.length - 1;
  if (cacheIndex < 0) return messages;
  return messages.map((m, i) => {
    if (i !== cacheIndex) return m;
    return {
      ...m,
      providerOptions: {
        ...(m.providerOptions ?? {}),
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    } as ModelMessage;
  });
}

function isWellKnownReasoningModel(model?: string): boolean {
  if (!model) return false;

  const models = [/glm-4.*/, /qwen3.*thinking/];
  const x = model.toLowerCase();
  for (const m of models) {
    if (x.match(m)?.length) {
      return true;
    }
  }
  return false;
}

function estimateTotalTokens(messages: Message[]): number {
  let totalTokens = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === "text") {
        totalTokens += estimateTokens(part.text);
      } else if (part.type === "reasoning") {
        totalTokens += estimateTokens(part.text);
      } else if (part.type === "file") {
        totalTokens += ImageEstimatedTokens;
      } else if (isStaticToolUIPart(part)) {
        totalTokens += estimateTokens(JSON.stringify(part));
      }
    }
  }
  return totalTokens;
}

async function resolvePromise(o: unknown): Promise<unknown> {
  const resolved = await o;
  if (R.isArray(resolved)) {
    return Promise.all(resolved.map((x) => resolvePromise(x)));
  }

  if (R.isObjectType(resolved)) {
    return Object.fromEntries(
      await Promise.all(
        Object.entries(resolved).map(async ([k, v]) => [
          k,
          await resolvePromise(v),
        ]),
      ),
    );
  }

  return resolved;
}

function handleReadFileOutput(
  blobStore: BlobStore,
  readFile: ClientTools["readFile"],
) {
  return tool({
    ...readFile,
    toModelOutput: ({ output }) => {
      if (output.type === "media") {
        const blob = findBlob(blobStore, new URL(output.data), output.mimeType);
        if (!blob) {
          return { type: "text", value: "Failed to load media." };
        }
        return {
          type: "content",
          value: [
            {
              type: "media",
              ...blob,
            },
          ],
        };
      }

      return {
        type: "json",
        value: output,
      };
    },
  });
}

function convertDataReviewsToText(messages: Message[]): Message[] {
  return messages.map((message) => ({
    ...message,
    parts: message.parts.flatMap((part) => {
      if (part.type === "data-reviews") {
        return {
          type: "text" as const,
          text: prompts.renderReviewComments(part.data.reviews),
        };
      }
      if (part.type === "data-user-edits") {
        return {
          type: "text" as const,
          text: prompts.renderUserEdits(part.data.userEdits),
        };
      }
      if (part.type === "data-active-selection") {
        return {
          type: "text" as const,
          text: prompts.renderActiveSelection(part.data.activeSelection),
        };
      }
      if (part.type === "data-bash-outputs") {
        return {
          type: "text" as const,
          text: prompts.renderBashOutputs(part.data.bashOutputs),
        };
      }
      return part;
    }),
  }));
}
