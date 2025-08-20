import { type Environment, getLogger } from "@getpochi/common";
import type { PochiApiClient } from "@getpochi/common/pochi-api";
import type { McpTool } from "@getpochi/tools";
import type { Store } from "@livestore/livestore";
import type { ChatInit, ChatOnErrorCallback, ChatOnFinishCallback } from "ai";
import type { LLMRequestData } from "..";
import { makeMessagesQuery, makeTaskQuery } from "../livestore/queries";
import { events, tables } from "../livestore/schema";
import { toTaskError, toTaskStatus } from "../task";
import type { Message } from "../types";
import { compactTask } from "./compact-task";
import {
  FlexibleChatTransport,
  type OnStartCallback,
} from "./flexible-chat-transport";
import {
  checkAndGenerateTaskTitle,
  getTitleFromMessages,
} from "./generate-task-title";

export type LiveChatKitOptions<T> = {
  taskId: string;
  abortSignal?: AbortSignal;

  // Request related getters
  getters: {
    getLLM: () => LLMRequestData;
    getEnvironment?: (options: {
      readonly messages: Message[];
    }) => Promise<Environment>;
    getMcpTools?: () => Record<string, McpTool>;
  };

  isSubTask?: boolean;

  store: Store;

  apiClient?: PochiApiClient;

  chatClass: new (options: ChatInit<Message>) => T;

  onBeforeMakeRequest?: (options: {
    messages: Message[];
  }) => void | Promise<void>;
} & Omit<
  ChatInit<Message>,
  "id" | "messages" | "generateId" | "onFinish" | "onError" | "transport"
>;

export class LiveChatKit<
  T extends { messages: Message[]; stop: () => Promise<void> },
> {
  protected readonly taskId: string;
  protected readonly store: Store;
  readonly chat: T;
  private readonly transport: FlexibleChatTransport;

  constructor({
    taskId,
    abortSignal,
    store,
    chatClass,
    onBeforeMakeRequest,
    getters,
    isSubTask,
    ...chatInit
  }: LiveChatKitOptions<T>) {
    this.taskId = taskId;
    this.store = store;
    this.transport = new FlexibleChatTransport({
      store,
      onStart: this.onStart,
      getters,
      isSubTask,
    });

    this.chat = new chatClass({
      ...chatInit,
      id: taskId,
      messages: this.messages,
      generateId: () => crypto.randomUUID(),
      onFinish: this.onFinish,
      onError: this.onError,
      transport: this.transport,
    });

    abortSignal?.addEventListener("abort", () => {
      this.chat.stop();
    });

    // @ts-expect-error: monkey patch
    const chat = this.chat as {
      makeRequest: (...args: unknown[]) => Promise<unknown>;
      setStatus: (status: { status: string; error?: unknown }) => void;
    };

    const originMakeRequest = chat.makeRequest;
    chat.makeRequest = async (...args) => {
      // Mark status to make async behaivor blocked based on status (e.g isLoading )
      const { messages } = this.chat;
      const lastMessage = messages.at(-1);
      if (lastMessage?.role === "user") {
        await compactTask({
          messages,
          getLLM: getters.getLLM,
          abortSignal,
          overwrite: true,
        });
      }
      if (onBeforeMakeRequest) {
        await onBeforeMakeRequest({ messages });
      }
      return originMakeRequest.apply(chat, args);
    };

    this.spawn = async () => {
      const { messages } = this.chat;
      const summary = await compactTask({
        messages,
        getLLM: getters.getLLM,
        abortSignal,
        overwrite: false,
      });
      if (!summary) {
        throw new Error("Failed to compact task");
      }

      const taskId = crypto.randomUUID();
      this.store.commit(
        events.taskInited({
          id: taskId,
          createdAt: new Date(),
          initMessage: {
            id: crypto.randomUUID(),
            parts: [
              {
                type: "text",
                text: summary,
              },

              {
                type: "text",
                text: "I've summarized the task and start a new task with the summary. Please analysis the current status, and use askFollowUpQuestion with me to confirm the next steps",
              },
            ],
          },
        }),
      );
      return taskId;
    };
  }

  init(prompt: string) {
    this.store.commit(
      events.taskInited({
        id: this.taskId,
        createdAt: new Date(),
        initMessage: {
          id: crypto.randomUUID(),
          parts: [
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      }),
    );

    // Sync the chat messages.
    this.chat.messages = this.messages;
  }

  get task() {
    return this.store.query(makeTaskQuery(this.taskId));
  }

  get messages() {
    return this.store
      .query(makeMessagesQuery(this.taskId))
      .map((x) => x.data as Message);
  }

  // Create a new task by compacting from current task, returns new taskId.
  readonly spawn: () => Promise<string>;

  get inited() {
    const countTask = this.store.query(
      tables.tasks.where("id", "=", this.taskId).count(),
    );
    return countTask > 0;
  }

  private readonly onStart: OnStartCallback = async ({
    messages,
    environment,
    abortSignal,
    getters,
  }) => {
    const { store } = this;
    const lastMessage = messages.at(-1);
    if (lastMessage) {
      if (!this.inited) {
        store.commit(
          events.taskInited({
            id: this.taskId,
            createdAt: new Date(),
          }),
        );
      }

      let title = store.query(
        tables.tasks.where("id", "=", this.taskId).first(),
      ).title;

      if (title === null) {
        title = getTitleFromMessages(messages);
      } else {
        title = await checkAndGenerateTaskTitle({
          taskTitle: title,
          messages,
          abortSignal,
          getLLM: getters.getLLM,
        });
      }

      const { gitStatus } = environment?.workspace || {};

      store.commit(
        events.chatStreamStarted({
          id: this.taskId,
          data: lastMessage,
          todos: environment?.todos || [],
          git: gitStatus
            ? {
                origin: gitStatus.origin,
                branch: gitStatus.currentBranch,
              }
            : undefined,
          title: title || undefined,
          updatedAt: new Date(),
        }),
      );
    }
  };

  private readonly onFinish: ChatOnFinishCallback<Message> = ({ message }) => {
    const { store } = this;
    if (message.metadata?.kind !== "assistant") {
      const error = new Error("Transport is aborted");
      error.name = "AbortError";
      throw error;
    }

    store.commit(
      events.chatStreamFinished({
        id: this.taskId,
        status: toTaskStatus(message, message.metadata?.finishReason),
        data: message,
        totalTokens: message.metadata.totalTokens,
        updatedAt: new Date(),
      }),
    );
  };

  private readonly onError: ChatOnErrorCallback = (error) => {
    logger.error("onError", error);
    const lastMessage = this.chat.messages.at(-1) || null;
    this.store.commit(
      events.chatStreamFailed({
        id: this.taskId,
        error: toTaskError(error),
        data: lastMessage,
        updatedAt: new Date(),
      }),
    );
  };
}

const logger = getLogger("LiveChatKit");
