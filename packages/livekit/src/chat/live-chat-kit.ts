import { getLogger } from "@getpochi/common";
import type { CustomAgent } from "@getpochi/tools";
import type { Store } from "@livestore/livestore";
import { Duration } from "@livestore/utils/effect";
import type { ChatInit, ChatOnErrorCallback, ChatOnFinishCallback } from "ai";
import type z from "zod/v4";
import { makeMessagesQuery, makeTaskQuery } from "../livestore/default-queries";
import { events, tables } from "../livestore/default-schema";
import { toTaskError, toTaskGitInfo, toTaskStatus } from "../task";

import type { Message, Task } from "../types";
import { scheduleGenerateTitleJob } from "./background-job";
import {
  FlexibleChatTransport,
  type OnStartCallback,
  type PrepareRequestGetters,
} from "./flexible-chat-transport";
import { compactTask } from "./llm";
import { walkthroughTask } from "./llm/walkthrough-task";
import { createModel } from "./models";

const logger = getLogger("LiveChatKit");

export type LiveChatKitOptions<T> = {
  taskId: string;
  displayId?: number;

  abortSignal?: AbortSignal;

  // Request related getters
  getters: PrepareRequestGetters;

  isSubTask?: boolean;
  isCli?: boolean;

  store: Store;

  chatClass: new (options: ChatInit<Message>) => T;

  onOverrideMessages?: (options: {
    store: Store;
    taskId: string;
    messages: Message[];
    abortSignal: AbortSignal;
  }) => void | Promise<void>;
  onStreamStart?: () => void;
  onStreamFinish?: (
    data: Pick<Task, "id" | "cwd" | "status"> & { messages: Message[] },
  ) => void;
  onStreamFailed?: (data: {
    error: Error;
    messages: Message[];
    cwd: string | null;
  }) => void;

  customAgent?: CustomAgent;
  outputSchema?: z.ZodAny;
} & Omit<
  ChatInit<Message>,
  "id" | "messages" | "generateId" | "onFinish" | "onError" | "transport"
>;

type InitOptions = {
  initTitle?: string;
  displayId?: number;
} & (
  | {
      prompt?: string;
    }
  | {
      parts?: Message["parts"];
    }
  | {
      messages?: Message[];
    }
);

export class LiveChatKit<
  T extends {
    messages: Message[];
    stop: () => Promise<void>;
  },
> {
  protected readonly taskId: string;
  protected readonly displayId?: number;
  protected readonly store: Store;
  readonly chat: T;
  private readonly transport: FlexibleChatTransport;
  onStreamStart?: () => void;
  onStreamFinish?: (
    data: Pick<Task, "id" | "cwd" | "status"> & {
      messages: Message[];
    },
  ) => void;
  onStreamFailed?: (data: {
    cwd: string | null;
    error: Error;
    messages: Message[];
  }) => void;
  readonly compact: () => Promise<string>;
  readonly walkthrough: () => Promise<string>;
  private lastStepStartTimestamp: number | undefined;

  constructor({
    taskId,
    displayId,
    abortSignal,
    store,
    chatClass,
    onOverrideMessages,
    getters,
    isSubTask,
    isCli,
    customAgent,
    outputSchema,
    onStreamStart,
    onStreamFinish,
    onStreamFailed,
    ...chatInit
  }: LiveChatKitOptions<T>) {
    this.taskId = taskId;
    this.displayId = displayId;
    this.store = store;
    this.onStreamStart = onStreamStart;
    this.onStreamFinish = onStreamFinish;
    this.onStreamFailed = onStreamFailed;
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
        await onOverrideMessages({
          store: this.store,
          taskId: this.taskId,
          messages,
          abortSignal,
        });
      }
    };

    this.compact = async () => {
      const { messages } = this.chat;
      const model = createModel({ llm: getters.getLLM() });
      const summary = await compactTask({
        store: this.store,
        taskId: this.taskId,
        model,
        messages,
      });
      if (!summary) {
        throw new Error("Failed to compact task");
      }
      return summary;
    };
    this.walkthrough = async () => {
      const { messages } = this.chat;
      const model = createModel({ llm: getters.getLLM() });
      const walkthrough = await walkthroughTask({
        store: this.store,
        taskId: this.taskId,
        model,
        messages,
      });
      if (!walkthrough) {
        throw new Error("Failed to walkthrough task");
      }
      return walkthrough;
    };
  }

  init(cwd: string | undefined, options?: InitOptions | undefined) {
    let initMessages: Message[] | undefined = undefined;
    if (options) {
      if ("messages" in options && options.messages) {
        initMessages = options.messages;
      } else if ("parts" in options && options.parts) {
        initMessages = [
          {
            id: crypto.randomUUID(),
            role: "user",
            parts: options.parts,
          },
        ];
      } else if ("prompt" in options && options.prompt) {
        initMessages = [
          {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text: options.prompt }],
          },
        ];
      }
    }

    this.store.commit(
      events.taskInited({
        id: this.taskId,
        cwd,
        createdAt: new Date(),
        initTitle: options?.initTitle,
        displayId: options?.displayId,
        initMessages,
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
          displayId: this.displayId,
        }),
      );

      this.lastStepStartTimestamp = Date.now();

      this.onStreamStart?.();
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

    const status = toTaskStatus(message, message.metadata?.finishReason);
    store.commit(
      events.chatStreamFinished({
        id: this.taskId,
        status,
        data: message,
        totalTokens: message.metadata.totalTokens,
        updatedAt: new Date(),
        duration: this.lastStepStartTimestamp
          ? Duration.millis(Date.now() - this.lastStepStartTimestamp)
          : undefined,
      }),
    );

    this.clearLastStepTimestamp();

    this.onStreamFinish?.({
      id: this.taskId,
      cwd: this.task?.cwd ?? null,
      status,
      messages: [...this.chat.messages],
    });
  };

  private clearLastStepTimestamp = () => {
    this.lastStepStartTimestamp = undefined;
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
        duration: this.lastStepStartTimestamp
          ? Duration.millis(Date.now() - this.lastStepStartTimestamp)
          : undefined,
      }),
    );

    this.clearLastStepTimestamp();

    this.onStreamFailed?.({
      cwd: this.task?.cwd ?? null,
      error,
      messages: [...this.chat.messages],
    });
  };
}
