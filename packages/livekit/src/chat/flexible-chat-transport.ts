import { getErrorMessage } from "@ai-sdk/provider";
import type { Environment, PochiProviderOptions } from "@getpochi/common";
import { formatters, prompts } from "@getpochi/common";
import * as R from "remeda";

import {
  type ClientTools,
  type CustomAgent,
  type McpTool,
  type Skill,
  overrideCustomAgentTools,
  selectClientTools,
} from "@getpochi/tools";
import {
  APICallError,
  type ChatRequestOptions,
  type ChatTransport,
  type ModelMessage,
  type UIMessageChunk,
  convertToModelMessages,
  isToolUIPart,
  streamText,
  tool,
  wrapLanguageModel,
} from "ai";
import { pickBy } from "remeda";
import type z from "zod/v4";
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

export type OnStartCallback = (options: {
  messages: Message[];
  environment?: Environment;
  abortSignal?: AbortSignal;
  getters: PrepareRequestGetters;
}) => void;

export type PrepareRequestGetters = {
  getLLM: () => RequestData["llm"];
  getEnvironment?: () => Promise<Environment>;
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
  store: LiveKitStore;
  blobStore: BlobStore;
  customAgent?: CustomAgent;
  outputSchema?: z.ZodAny;
};

export class FlexibleChatTransport implements ChatTransport<Message> {
  private readonly onStart?: OnStartCallback;
  private readonly getters: PrepareRequestGetters;
  private readonly isSubTask?: boolean;
  private readonly store: LiveKitStore;
  private readonly blobStore: BlobStore;
  private readonly customAgent?: CustomAgent;
  private readonly outputSchema?: z.ZodAny;

  constructor(options: ChatTransportOptions) {
    this.onStart = options.onStart;
    this.getters = options.getters;
    this.isSubTask = options.isSubTask;
    this.store = options.store;
    this.blobStore = options.blobStore;
    this.customAgent = overrideCustomAgentTools(options.customAgent);
    this.outputSchema = options.outputSchema;
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
    messages = prompts.injectEnvironment(messages, environment) as Message[];
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

    const tools = pickBy(
      {
        ...selectClientTools({
          isSubTask: !!this.isSubTask,
          customAgents,
          contentType: llm.contentType,
          skills,
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
    if (tools.readFile) {
      tools.readFile = handleReadFileOutput(this.blobStore, tools.readFile);
    }

    const preparedMessages = await prepareMessages(messages);
    const modelMessages = (await resolvePromise(
      convertToModelMessages(
        formatters.llm(preparedMessages),
        // toModelOutput is invoked within convertToModelMessages, thus we need to pass the tools here.
        { tools },
      ),
    )) as ModelMessage[];
    const stream = streamText({
      providerOptions: {
        pochi: {
          taskId: chatId,
          client: globalThis.POCHI_CLIENT,
          useCase: "agent",
        } satisfies PochiProviderOptions,
      },
      system: prompts.system(
        environment?.info?.customRules,
        this.customAgent,
        mcpInfo?.instructions,
      ),
      messages: modelMessages,
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
    toModelOutput: (output) => {
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
