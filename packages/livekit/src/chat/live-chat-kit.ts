import { getLogger } from "@getpochi/common";
import type { CustomAgent } from "@getpochi/tools";
import type { Store } from "@livestore/livestore";
import type { ChatInit, ChatOnErrorCallback, ChatOnFinishCallback } from "ai";
import type z from "zod/v4";
import { events, tables } from "../livestore/default-schema";
import { makeMessagesQuery, makeTaskQuery } from "../livestore/default-queries";
import { toTaskError, toTaskGitInfo, toTaskStatus } from "../task";

import type { Message } from "../types";
import { scheduleGenerateTitleJob } from "./background-job";
import {
  FlexibleChatTransport,
  type OnStartCallback,
  type PrepareRequestGetters,
} from "./flexible-chat-transport";
import { compactTask } from "./llm";
import { createModel } from "./models";

const logger = getLogger("LiveChatKit");

export type LiveChatKitOptions<T> = {
  taskId: string;
  abortSignal?: AbortSignal;

  // Request related getters
  getters: PrepareRequestGetters;

  isSubTask?: boolean;
  isCli?: boolean;

  store: Store;

  chatClass: new (options: ChatInit<Message>) => T;

  onOverrideMessages?: (options: {
    messages: Message[];
    abortSignal: AbortSignal;
  }) => void | Promise<void>;

  customAgent?: CustomAgent;
  outputSchema?: z.ZodAny;
} & Omit<
  ChatInit<Message>,
  "id" | "messages" | "generateId" | "onFinish" | "onError" | "transport"
>;

export class LiveChatKit<
  T extends {
    messages: Message[];
    stop: () => Promise<void>;
  },
> {
  protected readonly taskId: string;
  protected readonly store: Store;
  readonly chat: T;
  private readonly transport: FlexibleChatTransport;

  readonly spawn: () => Promise<string>;

  constructor({
    taskId,
    abortSignal,
    store,
    chatClass,
    onOverrideMessages,
    getters,
    isSubTask,
    isCli,
    customAgent,
    outputSchema,
    ...chatInit
  }: LiveChatKitOptions<T>) {
    this.taskId = taskId;
    this.store = store;
    this.transport = new FlexibleChatTransport({
      store,
      onStart: this.onStart,
      getters,
      isSubTask,
      isCli,
      customAgent,
      outputSchema,
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
      onBeforeSnapshotInMakeRequest: (options: {
        abortSignal: AbortSignal;
        lastMessage: Message;
      }) => Promise<void>;
    };

    chat.onBeforeSnapshotInMakeRequest = async ({ abortSignal }) => {
      // Mark status to make async behaivor blocked based on status (e.g isLoading )
      const { messages } = this.chat;
      const lastMessage = messages.at(-1);
      if (
        lastMessage?.role === "user" &&
        lastMessage.metadata?.kind === "user" &&
        lastMessage.metadata.compact
      ) {
        try {
          const model = createModel({ llm: getters.getLLM() });
          await compactTask({
            store: this.store,
            taskId: this.taskId,
            model,
            messages,
            abortSignal,
            inline: true,
          });
        } catch (err) {
          logger.error("Failed to compact task", err);
          throw err;
        }
      }
      if (onOverrideMessages) {
        await onOverrideMessages({ messages, abortSignal });
      }
    };

    this.spawn = async () => {
      const taskId = crypto.randomUUID();
      const { messages } = this.chat;
      const model = createModel({ llm: getters.getLLM() });
      const summary = await compactTask({
        store: this.store,
        taskId,
        model,
        messages,
        abortSignal,
      });
      if (!summary) {
        throw new Error("Failed to compact task");
      }

      this.store.commit(
        events.taskInited({
          id: taskId,
          cwd: this.task?.cwd || undefined,
          modelId: this.task?.modelId || undefined,
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
                text: "I've summarized the task and start a new task with the summary. Please analysis the current status, and use askFollowupQuestion with me to confirm the next steps",
              },
            ],
          },
        }),
      );
      return taskId;
    };
  }

  init(cwd: string | undefined, promptOrParts?: string | Message["parts"]) {
    const parts =
      typeof promptOrParts === "string"
        ? [{ type: "text", text: promptOrParts }]
        : promptOrParts;

    this.store.commit(
      events.taskInited({
        id: this.taskId,
        cwd,
        createdAt: new Date(),
        initMessage: parts
          ? {
              id: crypto.randomUUID(),
              parts,
            }
          : undefined,
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

  get inited() {
    const countTask = this.store.query(
      tables.tasks.where("id", "=", this.taskId).count(),
    );
    return countTask > 0;
  }

  updateIsPublicShared = (isPublicShared: boolean) => {
    this.store.commit(
      events.updateIsPublicShared({
        id: this.taskId,
        isPublicShared,
        updatedAt: new Date(),
      }),
    );
  };

  markAsFailed = (error: Error) => {
    this.store.commit(
      events.taskFailed({
        id: this.taskId,
        error: toTaskError(error),
        updatedAt: new Date(),
      }),
    );
  };

  private readonly onStart: OnStartCallback = async ({
    messages,
    environment,
    getters,
  }) => {
    const { store } = this;
    const lastMessage = messages.at(-1);
    if (lastMessage) {
      if (!this.inited) {
        store.commit(
          events.taskInited({
            id: this.taskId,
            cwd: environment?.info.cwd,
            createdAt: new Date(),
          }),
        );
      }

      const { task } = this;
      if (!task) {
        throw new Error("Task not found");
      }

      const llm = getters.getLLM();
      const getModel = () => createModel({ llm });
      scheduleGenerateTitleJob({
        taskId: this.taskId,
        store,
        messages,
        getModel,
      });

      store.commit(
        events.chatStreamStarted({
          id: this.taskId,
          data: lastMessage,
          todos: environment?.todos || [],
          git: toTaskGitInfo(environment?.workspace.gitStatus),
          updatedAt: new Date(),
          modelId: llm.id,
        }),
      );
    }
  };

  private readonly onFinish: ChatOnFinishCallback<Message> = ({
    message,
    isAbort,
    isError,
  }) => {
    const abortError = new Error("Transport is aborted");
    abortError.name = "AbortError";

    if (isAbort) {
      return this.onError(abortError);
    }

    if (isError) return; // handled in onError already.

    const { store } = this;
    if (message.metadata?.kind !== "assistant") {
      return this.onError(abortError);
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
