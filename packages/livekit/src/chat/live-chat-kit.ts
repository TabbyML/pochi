import type {
  AutoMemoryTaskState,
  BackgroundTaskState,
  ContextWindowUsage,
  PochiRequestUseCase,
  TaskMemoryState,
} from "@getpochi/common";
import { getLogger, isForkAgentUseCase, prompts } from "@getpochi/common";
import { prepareLastMessageForRetry as prepareMessageForRetry } from "@getpochi/common/message-utils";
import { hasActiveTodos } from "@getpochi/common/message-utils";
import type { RecentFileState } from "@getpochi/common/tool-utils";
import { type CustomAgent, ToolsByPermission } from "@getpochi/tools";
import { Duration } from "@livestore/utils/effect";
import {
  type ChatInit,
  type ChatOnErrorCallback,
  type ChatOnFinishCallback,
  isStaticToolUIPart,
} from "ai";
import type z from "zod";
import type { ForkAgent, ForkAgentHandle } from "../background-task/fork-agent";
import type { AutoMemoryManager } from "../background-task/memory/auto-memory";
import { AutoMemoryAdaptor } from "../background-task/memory/auto-memory";
import { TaskMemoryAdaptor } from "../background-task/memory/task-memory";
import type {
  MaybePromise,
  MemoryStateStore,
} from "../background-task/state-store";
import { InMemoryChat } from "../background-task/task-executor/in-memory-chat";
import {
  type RunningTaskAdaptor,
  TaskExecutor,
} from "../background-task/task-executor/task-executor";
import type { BlobStore } from "../blob-store";
import {
  makeAllDataQuery,
  makeMessagesQuery,
  makeTaskQuery,
} from "../livestore/default-queries";
import { events, tables } from "../livestore/default-schema";
import { toTaskError, toTaskGitInfo, toTaskStatus } from "../task";
import type { LiveKitStore, Message, Task } from "../types";
import {
  MaxConsecutiveAutoCompactFailures,
  shouldAutoCompact,
} from "./auto-compact-policy";
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
import { replaceAttemptCompletionWithTodoSubtask } from "./todo-completion-utils";
import { ImageEstimatedTokens, estimateTokens } from "./token-utils";

const logger = getLogger("LiveChatKit");
const OverrideMessagesSideEffectTimeoutMs = 12_000;
/** Compaction waits up to this long for an in-flight task-memory extraction. */
const TaskMemorySettleTimeoutMs = 5_000;
const TaskMemorySettlePollIntervalMs = 200;

type GetRecentFilesForCompact = () =>
  | RecentFileState[]
  | Promise<RecentFileState[]>;

export type LiveChatKitBackgroundTaskOptions = {
  stateStore?: {
    read(taskId: string): MaybePromise<BackgroundTaskState | undefined>;
    set(taskId: string, state: BackgroundTaskState): MaybePromise<void>;
  };
  adaptor?: RunningTaskAdaptor & { dispose?: () => void };
  clearFileStateCache?: (taskId: string) => MaybePromise<void>;
};

export type LiveChatKitTaskMemoryOptions = {
  stateStore?: MemoryStateStore<TaskMemoryState>;
};

export type LiveChatKitProjectMemoryOptions = {
  stateStore?: MemoryStateStore<AutoMemoryTaskState>;
  manager: AutoMemoryManager;
};

function createBackgroundTaskStateStore(): NonNullable<
  LiveChatKitBackgroundTaskOptions["stateStore"]
> {
  const states = new Map<string, BackgroundTaskState>();
  return {
    read: (taskId) => states.get(taskId),
    set: (taskId, state) => {
      states.set(taskId, state);
    },
  };
}

async function createBackgroundTaskFromForkAgent({
  store,
  stateStore,
  agent,
  taskId = crypto.randomUUID(),
  createdAt = new Date(),
}: {
  store: LiveKitStore;
  stateStore: NonNullable<LiveChatKitBackgroundTaskOptions["stateStore"]>;
  agent: ForkAgent<Message>;
  taskId?: string;
  createdAt?: Date;
}): Promise<ForkAgentHandle> {
  await stateStore.set(taskId, {
    parentTaskId: agent.parentTaskId,
    tools: agent.tools,
    useCase: agent.label,
    baselineStepCount: agent.baselineStepCount,
  });

  store.commit(
    events.taskInited({
      id: taskId,
      cwd: agent.cwd,
      background: true,
      createdAt,
      initMessages: agent.initMessages,
      initTitle: agent.initTitle,
    }),
  );

  return {
    taskId,
    cwd: agent.cwd,
    label: agent.label,
  };
}

async function readRecentFilesForCompact(
  getRecentFilesForCompact: GetRecentFilesForCompact | undefined,
): Promise<RecentFileState[] | undefined> {
  try {
    return await getRecentFilesForCompact?.();
  } catch (error) {
    logger.warn(
      "Failed to read recent files for compaction. Continue compacting without file restoration.",
      error,
    );
  }
}

/** Polls until no extraction is in progress or `timeoutMs` elapses. */
async function settleTaskMemoryExtraction(
  readTaskMemoryState: (() => TaskMemoryState | undefined) | undefined,
  timeoutMs: number,
): Promise<void> {
  if (!readTaskMemoryState) return;
  if (!readTaskMemoryState()?.isExtracting) return;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!readTaskMemoryState()?.isExtracting) return;
    await new Promise<void>((resolve) =>
      setTimeout(resolve, TaskMemorySettlePollIntervalMs),
    );
  }
}

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
  requestUseCase?: PochiRequestUseCase;
  disableAutoCompact?: boolean;

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
      startedAt?: Date;
      finishedAt?: Date;
    },
  ) => void;

  onCompactStart?: () => void;

  onCompactFinish?: (success: boolean) => void | Promise<void>;

  /**
   * Returns recent file contents the model saw before compaction.
   * They are appended to the compact block before the cache is cleared.
   */
  getRecentFilesForCompact?: GetRecentFilesForCompact;

  clearFileStateCache?: () => MaybePromise<void>;

  backgroundTask?: LiveChatKitBackgroundTaskOptions;

  taskMemory?: LiveChatKitTaskMemoryOptions;

  projectMemory?: LiveChatKitProjectMemoryOptions;

  customAgent?: CustomAgent;
  outputSchema?: z.ZodAny;
  attemptCompletionSchema?: z.ZodType;
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
  private readonly backgroundTaskExecutor: TaskExecutor | undefined;
  private readonly backgroundTaskAdaptor:
    | (RunningTaskAdaptor & { dispose?: () => void })
    | undefined;
  private readonly taskMemoryAdaptor: TaskMemoryAdaptor | undefined;
  private readonly autoMemoryAdaptor: AutoMemoryAdaptor | undefined;
  private readonly pendingMemoryOperations = new Set<Promise<void>>();
  private readonly clearFileStateCacheCallback:
    | (() => MaybePromise<void>)
    | undefined;

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
      startedAt?: Date;
      finishedAt?: Date;
    },
  ) => void;
  readonly compact: () => Promise<string>;
  readonly repairMermaid: (chart: string, error: string) => Promise<void>;
  private lastStepStartTimestamp: number | undefined;
  private consecutiveAutoCompactFailures = 0;

  constructor({
    taskId,
    abortSignal,
    store,
    blobStore,
    chatClass,
    onOverrideMessages,
    getters,
    isSubTask,
    requestUseCase,
    disableAutoCompact,
    customAgent,
    outputSchema,
    attemptCompletionSchema,
    onStreamStart,
    onStreamFinish,
    onCompactStart,
    onCompactFinish,
    getRecentFilesForCompact,
    clearFileStateCache,
    backgroundTask,
    taskMemory,
    projectMemory,
    ...chatInit
  }: LiveChatKitOptions<T>) {
    this.taskId = taskId;
    this.store = store;
    this.blobStore = blobStore;
    this.onStreamStart = onStreamStart;
    this.onStreamFinish = onStreamFinish;
    this.clearFileStateCacheCallback = clearFileStateCache;
    this.backgroundTaskAdaptor = backgroundTask?.adaptor;
    const backgroundTaskStateStore = backgroundTask
      ? (backgroundTask.stateStore ?? createBackgroundTaskStateStore())
      : undefined;
    const startForkAgent = backgroundTaskStateStore
      ? (agent: ForkAgent<Message>) =>
          createBackgroundTaskFromForkAgent({
            store,
            stateStore: backgroundTaskStateStore,
            agent,
          })
      : undefined;
    const waitForTaskDone = backgroundTask?.adaptor
      ? (taskId: string) =>
          this.backgroundTaskExecutor?.waitForTaskDone(taskId) ??
          Promise.resolve()
      : undefined;
    this.backgroundTaskExecutor =
      backgroundTask?.adaptor && backgroundTaskStateStore
        ? new TaskExecutor({
            store,
            blobStore,
            readTaskState: (taskId) => backgroundTaskStateStore.read(taskId),
            adaptor: backgroundTask.adaptor,
            clearFileStateCache: backgroundTask.clearFileStateCache,
            createChatKit: ({
              taskId,
              store,
              blobStore,
              abortSignal,
              requestUseCase,
              getters,
            }) =>
              new LiveChatKit<InMemoryChat>({
                taskId,
                store,
                blobStore,
                chatClass: InMemoryChat,
                abortSignal,
                isSubTask: false,
                requestUseCase,
                disableAutoCompact: true,
                getters,
              }),
          })
        : undefined;
    this.backgroundTaskExecutor?.start();
    const defaultMemoryParentCwd = () => this.task?.cwd ?? undefined;
    this.taskMemoryAdaptor =
      taskMemory && startForkAgent
        ? new TaskMemoryAdaptor({
            store,
            backgroundTask: {
              startForkAgent,
              ...(waitForTaskDone ? { waitForTaskDone } : {}),
            },
            taskMemoryStateStore: taskMemory.stateStore,
            parentTaskId: taskId,
            parentCwd: defaultMemoryParentCwd,
            isSubTask,
          })
        : undefined;
    this.autoMemoryAdaptor =
      projectMemory && startForkAgent && !isForkAgentUseCase(requestUseCase)
        ? new AutoMemoryAdaptor({
            store,
            backgroundTask: {
              startForkAgent,
              ...(waitForTaskDone ? { waitForTaskDone } : {}),
            },
            autoMemoryStateStore: projectMemory.stateStore,
            parentTaskId: taskId,
            parentCwd: defaultMemoryParentCwd,
            isSubTask,
            manager: projectMemory.manager,
          })
        : undefined;

    const readEffectiveTaskMemoryState = () =>
      this.taskMemoryAdaptor?.getState();
    this.transport = new FlexibleChatTransport({
      store,
      blobStore,
      onStart: this.onStart,
      getters,
      isSubTask,
      requestUseCase,
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
      const isManualCompact =
        lastMessage?.role === "user" &&
        lastMessage.metadata?.kind === "user" &&
        lastMessage.metadata.compact === true;

      const canAutoCompact =
        !disableAutoCompact && !isForkAgentUseCase(requestUseCase);
      const isAutoCompact =
        canAutoCompact &&
        !isManualCompact &&
        this.consecutiveAutoCompactFailures <
          MaxConsecutiveAutoCompactFailures &&
        shouldAutoCompact({
          messages,
          llm: getters.getLLM(),
          task: this.task,
          estimatedTotalTokens: estimateCurrentMessagesTokens(messages),
        });

      if (isManualCompact || isAutoCompact) {
        try {
          onCompactStart?.();
        } catch (notifyErr) {
          logger.warn("onCompactStart callback threw", notifyErr);
        }
        let compactSucceeded = false;
        try {
          // Wait briefly so memory.md and boundary id are fresh.
          await settleTaskMemoryExtraction(
            readEffectiveTaskMemoryState,
            TaskMemorySettleTimeoutMs,
          );
          const model = createModel({ llm: getters.getLLM() });
          if (isAutoCompact) {
            logger.info(
              `Auto-compact triggered (totalTokens=${
                this.task?.totalTokens ?? 0
              }).`,
            );
          }
          await compactTask({
            blobStore: this.blobStore,
            taskId: this.taskId,
            model,
            messages,
            recentFiles: await readRecentFilesForCompact(
              getRecentFilesForCompact,
            ),
            taskMemoryBoundaryMessageId:
              readEffectiveTaskMemoryState()?.lastExtractionMessageId,
            abortSignal,
            inline: true,
            store: this.store,
            useCase: isAutoCompact ? "auto-compact-task" : "compact-task",
          });
          if (isAutoCompact) {
            this.consecutiveAutoCompactFailures = 0;
          }
          compactSucceeded = true;
        } catch (err) {
          if (isAutoCompact) {
            this.consecutiveAutoCompactFailures += 1;
            logger.warn(
              `Auto-compact failed (${this.consecutiveAutoCompactFailures}/${MaxConsecutiveAutoCompactFailures}); request will proceed without compaction.`,
              err,
            );
          } else {
            logger.error("Failed to compact task", err);
            throw err;
          }
        } finally {
          await this.handleCompactFinish(compactSucceeded, onCompactFinish);
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
      try {
        onCompactStart?.();
      } catch (notifyErr) {
        logger.warn("onCompactStart callback threw", notifyErr);
      }
      let compactSucceeded = false;
      try {
        const { messages } = this.chat;
        // Wait briefly so memory.md and boundary id are fresh.
        await settleTaskMemoryExtraction(
          readEffectiveTaskMemoryState,
          TaskMemorySettleTimeoutMs,
        );
        const model = createModel({ llm: getters.getLLM() });
        const summary = await compactTask({
          blobStore: this.blobStore,
          taskId: this.taskId,
          model,
          messages,
          recentFiles: await readRecentFilesForCompact(
            getRecentFilesForCompact,
          ),
          taskMemoryBoundaryMessageId:
            readEffectiveTaskMemoryState()?.lastExtractionMessageId,
          store: this.store,
        });

        if (!summary) {
          throw new Error("Failed to compact task");
        }
        compactSucceeded = true;
        return summary;
      } finally {
        await this.handleCompactFinish(compactSucceeded, onCompactFinish);
      }
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
      if (!task.background) {
        const getModel = () => createModel({ llm });
        scheduleGenerateTitleJob({
          taskId: this.taskId,
          store,
          blobStore: this.blobStore,
          messages,
          getModel,
        });
      }

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

    const filteredMessage = filterCompletionTools(originalMessage)
    const message = prepareAttemptTodoCompletionSubtask({
      message: filteredMessage,
      task: this.task,
      taskId: this.taskId,
      store: this.store,
    });

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
        projectMemoryTokens,
      } = estimateTokenBreakdown(this.chat.messages);
      const systemTokens =
        (message.metadata.systemPromptTokens || 0) + systemReminderTokens;
      const toolsTokens = message.metadata.toolsTokens || 0;

      const totalTokens =
        systemTokens +
        toolsTokens +
        messagesTokens +
        filesTokens +
        toolResultsTokens +
        projectMemoryTokens;
      if (totalTokens > 0) {
        contextWindowUsage = {
          system: systemTokens,
          tools: toolsTokens,
          messages: messagesTokens,
          files: filesTokens,
          toolResults: toolResultsTokens,
          projectMemory: projectMemoryTokens,
        };
      }
    }

    const { duration, startedAt, finishedAt } =
      this.captureStepDuration() ?? {};

    store.commit(
      events.chatStreamFinished({
        id: this.taskId,
        status,
        data: message,
        totalTokens: message.metadata.totalTokens,
        updatedAt: new Date(),
        duration,
        lastCheckpointHash: getCleanCheckpoint(this.chat.messages),
      }),
    );

    this.clearLastStepTimestamp();

    const finishData = {
      id: this.taskId,
      cwd: this.task?.cwd ?? null,
      status,
      messages: [...this.chat.messages],
      contextWindowUsage,
    };

    this.scheduleMemoryUpdate(finishData);

    this.onStreamFinish?.({
      ...finishData,
      startedAt,
      finishedAt,
    });
  };

  private async settleMemoryAndMaybeContinue(): Promise<boolean> {
    await this.waitForMemoryOperations();
    await this.taskMemoryAdaptor?.settle();
    return (await this.autoMemoryAdaptor?.settleAndMaybeContinue()) ?? false;
  }

  private async waitForMemoryOperations(): Promise<void> {
    while (this.pendingMemoryOperations.size > 0) {
      await Promise.allSettled([...this.pendingMemoryOperations]);
    }
  }

  async drainBackgroundTasksAndSettleMemory(): Promise<void> {
    await this.waitForMemoryOperations();
    await this.backgroundTaskExecutor?.drain();
    while (await this.settleMemoryAndMaybeContinue()) {
      await this.backgroundTaskExecutor?.drain();
    }
    await this.settleMemoryAndMaybeContinue();
  }

  async disposeBackgroundTasks(): Promise<void> {
    await this.backgroundTaskExecutor?.dispose();
    this.backgroundTaskAdaptor?.dispose?.();
  }

  private scheduleMemoryUpdate(data: {
    messages: Message[];
    status?: string;
    contextWindowUsage?: ContextWindowUsage;
  }) {
    if (!this.taskMemoryAdaptor && !this.autoMemoryAdaptor) return;

    const promise = Promise.all([
      this.taskMemoryAdaptor?.update({
        messages: data.messages,
        contextWindowUsage: data.contextWindowUsage,
      }),
      this.autoMemoryAdaptor?.update({
        messages: data.messages,
        status: data.status,
      }),
    ])
      .catch((error) => {
        logger.warn("Memory update failed", error);
      })
      .then(() => undefined);

    const tracked = promise.finally(() => {
      this.pendingMemoryOperations.delete(tracked);
    });
    this.pendingMemoryOperations.add(tracked);
  }

  prepareLastMessageForRetry = async (
    message: Message,
  ): Promise<Message | undefined> => {
    const prepared = prepareMessageForRetry(message);
    if (!prepared) return undefined;
    await this.clearFileStateCache();
    return prepared as Message;
  };

  private async handleCompactFinish(
    success: boolean,
    onCompactFinish: ((success: boolean) => void | Promise<void>) | undefined,
  ) {
    if (success) {
      await this.taskMemoryAdaptor?.resetTokenBaseline();
      await this.clearFileStateCache();
    }

    try {
      await onCompactFinish?.(success);
    } catch (notifyErr) {
      logger.warn("onCompactFinish callback threw", notifyErr);
    }
  }

  private async clearFileStateCache() {
    try {
      await this.clearFileStateCacheCallback?.();
    } catch (error) {
      logger.warn("Failed to clear file-state cache", error);
    }
  }

  private clearLastStepTimestamp = () => {
    this.lastStepStartTimestamp = undefined;
  };

  private readonly onError: ChatOnErrorCallback = (error) => {
    logger.error("onError", error);
    const lastMessage = this.chat.messages.at(-1) || null;

    const { duration, startedAt, finishedAt } =
      this.captureStepDuration() ?? {};

    this.store.commit(
      events.chatStreamFailed({
        id: this.taskId,
        error: toTaskError(error),
        data: lastMessage,
        updatedAt: new Date(),
        duration,
        lastCheckpointHash: getCleanCheckpoint(this.chat.messages),
      }),
    );

    this.onStreamFinish?.({
      id: this.taskId,
      cwd: this.task?.cwd ?? null,
      status: "failed",
      messages: [...this.chat.messages],
      error,
      startedAt,
      finishedAt,
    });
  };

  /**
   * Captures the current step duration using the recorded start timestamp.
   */
  private captureStepDuration():
    | {
        startedAt: Date;
        finishedAt: Date;
        duration: ReturnType<typeof Duration.millis>;
      }
    | undefined {
    const startTimestamp = this.lastStepStartTimestamp;
    this.lastStepStartTimestamp = undefined;
    const finishTimestamp = Date.now();

    if (startTimestamp === undefined) {
      return undefined;
    }
    return {
      startedAt: new Date(startTimestamp),
      finishedAt: new Date(finishTimestamp),
      duration: Duration.millis(finishTimestamp - startTimestamp),
    };
  }
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

function prepareAttemptTodoCompletionSubtask({
  message,
  task,
  taskId,
  store,
}: {
  message: Message;
  task: Task | undefined;
  taskId: string;
  store: LiveKitStore;
}): Message {
  if (!hasActiveTodos(task?.todos)) {
    return message;
  }

  const todoAuditTaskId = crypto.randomUUID();
  const todoAuditToolCallId = crypto.randomUUID();
  const nextMessage = replaceAttemptCompletionWithTodoSubtask(
    message,
    task?.todos ?? [],
    {
      toolCallId: todoAuditToolCallId,
      uid: todoAuditTaskId,
    },
  );
  const todoAuditPart =
    nextMessage !== message
      ? nextMessage.parts.find(
          (part) =>
            part.type === "tool-newTask" &&
            part.input?._meta?.uid === todoAuditTaskId,
        )
      : undefined;

  if (todoAuditPart?.type !== "tool-newTask" || !todoAuditPart.input) {
    return nextMessage;
  }

  store.commit(
    events.taskInited({
      id: todoAuditTaskId,
      cwd: task?.cwd ?? undefined,
      parentId: taskId,
      createdAt: new Date(),
      initMessages: [
        {
          id: crypto.randomUUID(),
          role: "user",
          parts: [
            {
              type: "text",
              text: todoAuditPart.input.prompt,
            },
          ],
        },
      ],
    }),
  );

  return nextMessage;
}

function estimateTokenBreakdown(messages: Message[]) {
  let messagesTokens = 0;
  let filesTokens = 0;
  let toolResultsTokens = 0;
  let systemReminderTokens = 0;
  let projectMemoryTokens = 0;

  for (const msg of messages) {
    for (const part of msg.parts) {
      if (part.type === "text") {
        let contentStr = part.text;
        if (msg.role === "user" && contentStr.includes("<system-reminder>")) {
          const reminderRegex = /<system-reminder>[\s\S]*?<\/system-reminder>/g;
          const reminders = contentStr.match(reminderRegex);
          if (reminders) {
            for (const reminder of reminders) {
              const tokens = estimateTokens(reminder);
              if (prompts.isAutoMemorySystemReminder(reminder)) {
                projectMemoryTokens += tokens;
              } else {
                systemReminderTokens += tokens;
              }
            }
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
    projectMemoryTokens,
  };
}

function estimateCurrentMessagesTokens(messages: Message[]) {
  const {
    messagesTokens,
    filesTokens,
    toolResultsTokens,
    systemReminderTokens,
    projectMemoryTokens,
  } = estimateTokenBreakdown(messages);

  return (
    messagesTokens +
    filesTokens +
    toolResultsTokens +
    systemReminderTokens +
    projectMemoryTokens
  );
}
