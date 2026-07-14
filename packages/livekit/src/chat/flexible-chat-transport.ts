import { getErrorMessage } from "@ai-sdk/provider";
import type {
  AutoMemoryContext,
  Environment,
  MaybePromise,
  MessageMetadata,
  PochiProviderOptions,
  PochiRequestUseCase,
} from "@getpochi/common";
import { formatters, prompts } from "@getpochi/common";
import { hasActiveTodos } from "@getpochi/common/message-utils";
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
  type UIMessageChunk,
  convertToModelMessages,
  streamText,
  tool,
  wrapLanguageModel,
} from "ai";
import type z from "zod";
import type { BlobStore } from "../blob-store";
import { findBlob, makeDownloadFunction } from "../store-blob";
import type { LiveKitStore, Message, RequestData } from "../types";
import { makeRepairToolCall } from "./llm";
import { parseMcpToolSet } from "./mcp-utils";
import {
  createNewTaskMiddleware,
  createReasoningMiddleware,
  createToolCallMiddleware,
} from "./middlewares";
import { createModel } from "./models";
import { estimateTokens, estimateTotalTokens } from "./token-utils";

export type OnStartCallback = (options: {
  messages: Message[];
  environment?: Environment;
  abortSignal?: AbortSignal;
  getters: PrepareRequestGetters;
}) => void;

export type FinishedRequestSnapshot = {
  systemPrompt: string;
  systemPromptTokens: number;
  toolsTokens: number;
};

function createAbortAwareUIStreamTransform(
  abortSignal: AbortSignal | undefined,
) {
  let onAbort: (() => void) | undefined;
  return new TransformStream<UIMessageChunk, UIMessageChunk>({
    start(controller) {
      if (!abortSignal) return;
      if (abortSignal.aborted) {
        controller.terminate();
        return;
      }
      onAbort = () => {
        controller.terminate();
      };
      abortSignal.addEventListener("abort", onAbort, { once: true });
    },
    transform(chunk, controller) {
      // `streamText` receives the same abort signal, but provider/SDK chunks can
      // already be queued locally when abort fires. Gate the UI stream too so
      // post-abort chunks cannot mutate the chat message state.
      if (abortSignal?.aborted) {
        controller.terminate();
        return;
      }
      controller.enqueue(chunk);
    },
    flush() {
      if (onAbort) {
        abortSignal?.removeEventListener("abort", onAbort);
      }
    },
  });
}

export type PrepareRequestGetters = {
  getLLM: () => RequestData["llm"];
  getEnvironment?: () => Promise<Environment>;
  getAutoMemory?: () => Promise<AutoMemoryContext | undefined>;
  isTodoModeActive?: () => boolean;
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
  requestUseCase?: PochiRequestUseCase;
  store: LiveKitStore;
  blobStore: BlobStore;
  customAgent?: CustomAgent;
  attemptCompletionSchema?: z.ZodAny;
  systemPromptOverride?: string;
  onRequestFinished?: (snapshot: FinishedRequestSnapshot) => MaybePromise<void>;
};

export class FlexibleChatTransport implements ChatTransport<Message> {
  private readonly onStart?: OnStartCallback;
  private readonly getters: PrepareRequestGetters;
  private readonly isSubTask?: boolean;
  private readonly requestUseCase: PochiRequestUseCase;
  private readonly store: LiveKitStore;
  private readonly blobStore: BlobStore;
  private readonly customAgent?: CustomAgent;
  private readonly attemptCompletionSchema?: z.ZodAny;
  private readonly systemPromptOverride?: string;
  private readonly onRequestFinished?: ChatTransportOptions["onRequestFinished"];

  constructor(options: ChatTransportOptions) {
    this.onStart = options.onStart;

    this.getters = options.getters;
    this.isSubTask = options.isSubTask;
    this.requestUseCase = options.requestUseCase ?? "agent";
    this.store = options.store;
    this.blobStore = options.blobStore;
    this.customAgent = options.customAgent;
    this.attemptCompletionSchema = options.attemptCompletionSchema;
    this.systemPromptOverride = options.systemPromptOverride;
    this.onRequestFinished = options.onRequestFinished;
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
    const todoModeEnabled =
      !this.isSubTask && hasActiveTodos(environment?.todos);

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

    const generatedSystemPrompt = prompts.system(
      environment?.info?.customRules,
      this.customAgent,
      mcpInfo?.instructions,
      autoMemory,
      { todoModeEnabled, todos: environment?.todos },
    );
    const systemPrompt = this.systemPromptOverride ?? generatedSystemPrompt;
    const systemPromptTokens = estimateTokens(systemPrompt);
    const toolsTokens = estimateTokens(JSON.stringify(tools));

    const preparedMessages = await prepareMessages(messages);
    const llmMessages = formatters.llm(preparedMessages);
    const modelMessages = (await resolvePromise(
      await convertToModelMessages(
        llmMessages,
        // toModelOutput is invoked within convertToModelMessages, thus we need to pass the tools here.
        { tools },
      ),
    )) as ModelMessage[];

    const requestStartedAt = new Date();
    // Anthropic cache breakpoints are applied server-side based on `useCase`.
    const stream = streamText({
      providerOptions: {
        pochi: {
          taskId: chatId,
          storeId: this.store.storeId,
          client: globalThis.POCHI_CLIENT,
          useCase: this.requestUseCase,
        } satisfies PochiProviderOptions,
      },
      system: systemPrompt,
      messages: modelMessages,
      model: wrapLanguageModel({
        model,
        middleware: middlewares,
      }),
      abortSignal,
      tools,
      maxRetries: 0,
      timeout: {
        // Abort if no chunk is received within 15s to prevent indefinitely stalled streams.
        chunkMs: 15_000,
      },
      // error log is handled in live chat kit.
      onError: () => {},
      experimental_repairToolCall: makeRepairToolCall(
        chatId,
        this.store.storeId,
        model,
      ),
      experimental_download: makeDownloadFunction(this.blobStore),
    });
    return stream
      .toUIMessageStream({
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
            const now = new Date();
            const duration = now.getTime() - requestStartedAt.getTime();
            const lastMessage = preparedMessages[preparedMessages.length - 1];
            const lastMessageMetadata =
              lastMessage?.role === "assistant" &&
              lastMessage.metadata?.kind === "assistant"
                ? lastMessage.metadata
                : undefined;
            return {
              kind: "assistant",
              // The client only consumes the aggregated total token count here.
              // Detailed usage shape differences are a server/protocol concern.
              totalTokens:
                part.totalUsage.totalTokens || estimateTotalTokens(llmMessages),
              finishReason: part.finishReason,
              startedAt: requestStartedAt,
              finishedAt: now,
              totalStreamingDuration:
                (lastMessageMetadata?.totalStreamingDuration ?? 0) + duration,
            } satisfies MessageMetadata;
          }
        },
        onFinish: async () => {
          await this.onRequestFinished?.({
            systemPrompt,
            systemPromptTokens,
            toolsTokens,
          });
        },
      })
      .pipeThrough(createAbortAwareUIStreamTransform(abortSignal));
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
