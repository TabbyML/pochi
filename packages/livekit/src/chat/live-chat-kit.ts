import { getLogger } from "@getpochi/common";
import { type CustomAgent, ToolsByPermission } from "@getpochi/tools";
import { Duration } from "@livestore/utils/effect";
import {
  type ChatInit,
  type ChatOnErrorCallback,
  type ChatOnFinishCallback,
  isStaticToolUIPart,
} from "ai";
import type z from "zod";
import type { BlobStore } from "../blob-store";
import {
  makeAllDataQuery,
  makeMessagesQuery,
  makeTaskQuery,
} from "../livestore/default-queries";
import { events, tables } from "../livestore/default-schema";
import { toTaskError, toTaskGitInfo, toTaskStatus } from "../task";

import type { ContextWindowUsage } from "@getpochi/common/vscode-webui-bridge";
import type { LiveKitStore, Message, Task } from "../types";
import { scheduleGenerateTitleJob } from "./background-job";
import { filterCompletionTools } from "./filter-completion-tools";
import {
  FlexibleChatTransport,
  type OnStartCallback,
  type PrepareRequestGetters,
} from "./flexible-chat-transport";
import { prepareForkTaskData } from "./fork-task-tools";
import { compactTask, repairMermaid } from "./llm";
import { createModel } from "./models";
import { ImageEstimatedTokens, estimateTokens } from "./token-utils";

const logger = getLogger("LiveChatKit");
const OverrideMessagesSideEffectTimeoutMs = 12_000;

async function runSideEffectSafely({
  sideEffectName,
  timeoutMs,
  abortSignal,
  run,
}: {
  sideEffectName: string;
  timeoutMs: number;
  abortSignal?: AbortSignal;
  run: () => Promise<void>;
}): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  const sideEffectPromise: Promise<"done"> = run()
    .catch((error) => {
      logger.warn(
        `${sideEffectName} failed. Continue sending message without this side effect.`,
        error,
      );
    })
    .then(() => "done");

  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timeoutId = setTimeout(() => resolve("timeout"), timeoutMs);
  });

  const racePromises: Array<Promise<"done" | "timeout" | "aborted">> = [
    sideEffectPromise,
    timeoutPromise,
  ];

  if (abortSignal) {
    const abortPromise = new Promise<"aborted">((resolve) => {
      if (abortSignal.aborted) {
        resolve("aborted");
        return;
      }
      onAbort = () => resolve("aborted");
      abortSignal.addEventListener("abort", onAbort, { once: true });
    });
    racePromises.push(abortPromise);
  }

  try {
    const result = await Promise.race(racePromises);
    if (result === "timeout") {
      logger.warn(
        `${sideEffectName} timed out after ${timeoutMs}ms. Continue sending message without waiting.`,
      );
    } else if (result === "aborted") {
      logger.trace(`${sideEffectName} skipped because request was aborted.`);
    }
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (abortSignal && onAbort) {
      abortSignal.removeEventListener("abort", onAbort);
    }
  }
}

export type LiveChatKitOptions<T> = {
  taskId: string;

  abortSignal?: AbortSignal;

  // Request related getters
  getters: PrepareRequestGetters;

  isSubTask?: boolean;

  store: LiveKitStore;

  blobStore: BlobStore;

  chatClass: new (options: ChatInit<Message>) => T;

  onOverrideMessages?: (options: {
    store: LiveKitStore;
    taskId: string;
    messages: Message[];
    abortSignal: AbortSignal;
  }) => void | Promise<void>;
  onStreamStart?: (
    data: Pick<Task, "id" | "cwd"> & {
      messages: Message[];
    },
  ) => void;
  onStreamFinish?: (
    data: Pick<Task, "id" | "cwd" | "status"> & {
      messages: Message[];
      error?: Error;
      contextWindowUsage?: ContextWindowUsage;
    },
  ) => void;

  /**
   * Called after a successful compaction (inline or explicit).
   * Use this to clear caches (e.g. FileStateCache) that depend on
   * conversation context that was discarded during compaction.
   */
  onCompact?: () => void;

  customAgent?: CustomAgent;
  outputSchema?: z.ZodAny;
  attemptCompletionSchema?: z.ZodAny;
} & Omit<
  ChatInit<Message>,
  "id" | "messages" | "generateId" | "onFinish" | "onError" | "transport"
>;

type InitOptions = {
  initTitle?: string;
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
  protected readonly store: LiveKitStore;
  protected readonly blobStore: BlobStore;
  readonly chat: T;
  private readonly transport: FlexibleChatTransport;

  onStreamStart?: (
    data: Pick<Task, "id" | "cwd"> & {
      messages: Message[];
    },
  ) => void;
  onStreamFinish?: (
    data: Pick<Task, "id" | "cwd" | "status"> & {
      messages: Message[];
      error?: Error;
      contextWindowUsage?: ContextWindowUsage;
    },
  ) => void;
  readonly compact: () => Promise<string>;
  readonly repairMermaid: (chart: string, error: string) => Promise<void>;
  private lastStepStartTimestamp: number | undefined;

  constructor({
    taskId,
    abortSignal,
    store,
    blobStore,
    chatClass,
    onOverrideMessages,
    onCompact,
    getters,
    isSubTask,
    customAgent,
    outputSchema,
    attemptCompletionSchema,
    onStreamStart,

    onStreamFinish,
    ...chatInit
  }: LiveChatKitOptions<T>) {
    this.taskId = taskId;
    this.store = store;
    this.blobStore = blobStore;
    this.onStreamStart = onStreamStart;
    this.onStreamFinish = onStreamFinish;
    this.transport = new FlexibleChatTransport({
      store,
      blobStore,
      onStart: this.onStart,
      getters,
      isSubTask,
      customAgent,
      outputSchema,
      attemptCompletionSchema,
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
            blobStore: this.blobStore,
            taskId: this.taskId,
            model,
            messages,
            abortSignal,
            inline: true,
          });
          onCompact?.();
        } catch (err) {
          logger.error("Failed to compact task", err);
          throw err;
        }
      }
      if (onOverrideMessages) {
        await runSideEffectSafely({
          sideEffectName: "onOverrideMessages",
          timeoutMs: OverrideMessagesSideEffectTimeoutMs,
          abortSignal,
          run: async () => {
            await onOverrideMessages({
              store: this.store,
              taskId: this.taskId,
              messages,
              abortSignal,
            });
          },
        });
      }
    };

    this.compact = async () => {
      const { messages } = this.chat;
      const model = createModel({ llm: getters.getLLM() });
      const summary = await compactTask({
        blobStore: this.blobStore,
        taskId: this.taskId,
        model,
        messages,
      });

      if (!summary) {
        throw new Error("Failed to compact task");
      }
      onCompact?.();
      return summary;
    };

    this.repairMermaid = async (chart: string, error: string) => {
      const model = createModel({ llm: getters.getLLM() });
      await repairMermaid({
        store,
        taskId: this.taskId,
        model,
        messages: this.chat.messages,
        chart,
        error,
      });

      this.chat.messages = this.messages;
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

  fork = (
    sourceStore: LiveKitStore,
    forkTaskParams: {
      taskId: string;
      title: string | undefined;
      commitId: string;
      messageId?: string;
    },
  ) => {
    const {
      tasks: tasksQuery,
      messages: messagesQuery,
      files: filesQuery,
    } = makeAllDataQuery();
    const tasks = sourceStore.query(tasksQuery);
    const messages = sourceStore.query(messagesQuery);
    const files = sourceStore.query(filesQuery);

    const data = prepareForkTaskData({
      tasks,
      messages,
      files,
      oldTaskId: forkTaskParams.taskId,
      commitId: forkTaskParams.commitId,
      messageId: forkTaskParams.messageId,
      newTaskId: this.taskId,
      newTaskTitle: forkTaskParams.title,
    });

    this.store.commit(events.forkTaskInited(data));
    this.chat.messages = this.messages;
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
        blobStore: this.blobStore,
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

      this.lastStepStartTimestamp = Date.now();

      this.onStreamStart?.({
        id: this.taskId,
        cwd: this.task?.cwd ?? null,
        messages: [...messages],
      });
    }
  };

  private readonly onFinish: ChatOnFinishCallback<Message> = ({
    message: originalMessage,
    isAbort,
    isError,
    finishReason: streamFinishReason,
  }) => {
    const abortError = new Error("Transport is aborted");
    abortError.name = "AbortError";

    if (isAbort) {
      return this.onError(abortError);
    }

    if (isError) return; // handled in onError already.

    const message = filterCompletionTools(originalMessage);
    this.chat.messages = [...this.chat.messages.slice(0, -1), message];

    const { store } = this;
    if (message.metadata?.kind !== "assistant") {
      return this.onError(abortError);
    }

    const finishReason = streamFinishReason ?? message.metadata?.finishReason;
    const status = toTaskStatus(message, finishReason);

    let contextWindowUsage: ContextWindowUsage | undefined = undefined;
    if (message.metadata?.kind === "assistant") {
      const {
        messagesTokens,
        filesTokens,
        toolResultsTokens,
        systemReminderTokens,
      } = estimateTokenBreakdown(this.chat.messages);
      const systemTokens =
        (message.metadata.systemPromptTokens || 0) + systemReminderTokens;
      const toolsTokens = message.metadata.toolsTokens || 0;

      const totalTokens =
        systemTokens +
        toolsTokens +
        messagesTokens +
        filesTokens +
        toolResultsTokens;
      if (totalTokens > 0) {
        contextWindowUsage = {
          system: systemTokens,
          tools: toolsTokens,
          messages: messagesTokens,
          files: filesTokens,
          toolResults: toolResultsTokens,
        };
      }
    }

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
        lastCheckpointHash: getCleanCheckpoint(this.chat.messages),
      }),
    );

    this.clearLastStepTimestamp();

    this.onStreamFinish?.({
      id: this.taskId,
      cwd: this.task?.cwd ?? null,
      status,
      messages: [...this.chat.messages],
      contextWindowUsage,
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
        lastCheckpointHash: getCleanCheckpoint(this.chat.messages),
      }),
    );

    this.clearLastStepTimestamp();

    this.onStreamFinish?.({
      id: this.taskId,
      cwd: this.task?.cwd ?? null,
      status: "failed",
      messages: [...this.chat.messages],
      error,
    });
  };
}

// clean checkpoint means after this checkpoint there are no write or execute toolcalls that may cause file edits
const getCleanCheckpoint = (messages: Message[]) => {
  const lastPart = messages
    .flatMap((m) => m.parts)
    .filter(
      (p) =>
        p.type === "data-checkpoint" ||
        ToolsByPermission.write.some((tool) => p.type === `tool-${tool}`) ||
        ToolsByPermission.execute.some((tool) => p.type === `tool-${tool}`),
    )
    .at(-1);

  if (lastPart?.type === "data-checkpoint") {
    return lastPart.data.commit;
  }
};

function estimateTokenBreakdown(messages: Message[]) {
  let messagesTokens = 0;
  let filesTokens = 0;
  let toolResultsTokens = 0;
  let systemReminderTokens = 0;

  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === "text") {
        let contentStr = part.text;
        if (msg.role === "user" && contentStr.includes("<system-reminder>")) {
          const reminderRegex = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
          const reminders = contentStr.match(reminderRegex);
          if (reminders) {
            systemReminderTokens += estimateTokens(reminders.join(""));
            contentStr = contentStr.replace(reminderRegex, "");
          }
        }
        messagesTokens += estimateTokens(contentStr);
      } else if (part.type === "file") {
        filesTokens += ImageEstimatedTokens;
      } else if (isStaticToolUIPart(part)) {
        messagesTokens += estimateTokens(JSON.stringify(part.input || {}));
        if (part.state === "output-available" && part.output) {
          const output = (part as unknown as { output: unknown }).output;
          let outputTokens = 0;

          if (output instanceof Uint8Array) {
            outputTokens = ImageEstimatedTokens;
          } else {
            const resultStr =
              typeof output === "string" ? output : JSON.stringify(output);
            outputTokens = estimateTokens(resultStr);
          }

          const toolName = part.type.replace(/^tool-/, "");
          if (["readFile", "searchFiles", "globFiles"].includes(toolName)) {
            filesTokens += outputTokens;
          } else {
            toolResultsTokens += outputTokens;
          }
        }
      } else if (part.type === "reasoning") {
        messagesTokens += estimateTokens(part.text);
      } else {
        messagesTokens += estimateTokens(JSON.stringify(part));
      }
    }
  }

  return {
    messagesTokens,
    filesTokens,
    toolResultsTokens,
    systemReminderTokens,
  };
}
