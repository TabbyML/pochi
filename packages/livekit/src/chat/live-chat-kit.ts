import type {
  AutoMemoryTaskState,
  BackgroundJobNotification,
  ContextWindowUsage,
  MaybePromise,
  PochiRequestUseCase,
  TaskMemoryState,
} from "@getpochi/common";
import {
  formatters,
  getLogger,
  isForkAgentUseCase,
  prompts,
} from "@getpochi/common";
import {
  hasActiveTodos,
  stripOpenAIItemReferencesFromLastStep,
} from "@getpochi/common/message-utils";
import type { RecentFileState } from "@getpochi/common/tool-utils";
import {
  type CustomAgent,
  ToolsByPermission,
  getToolCallCancelErrorMessage,
  isReadonlyToolCall,
  isUserInputToolPart,
} from "@getpochi/tools";
import { Duration } from "@livestore/utils/effect";
import {
  type ChatInit,
  type ChatOnErrorCallback,
  type ChatOnFinishCallback,
  type ChatRequestOptions,
  type ChatStatus,
  getToolName,
  isToolUIPart,
} from "ai";
import type z from "zod";
import { BackgroundJobManager } from "../background-job/manager";
import { MonitorMaxDeliveryCharacters } from "../background-job/monitor-delivery";
import type { AutoMemoryManager } from "../background-task/memory/auto-memory";
import type { AutoMemoryAdaptor } from "../background-task/memory/auto-memory";
import type { TaskMemoryAdaptor } from "../background-task/memory/task-memory";
import type { MemoryStateStore } from "../background-task/state-store";
import type { BlobStore } from "../blob-store";
import {
  type TaskEvent,
  forkTaskInitEvents,
  taskEvents,
  taskInitEvents,
} from "../livestore";
import {
  makeAllDataQuery,
  makeMessagesQuery,
  makeTaskQuery,
} from "../livestore/default-queries";
import { events, tables } from "../livestore/default-schema";
import { toTaskError, toTaskGitInfo, toTaskStatus } from "../task";
import { getSubAgentInvocation, isAwaitingFollowupAnswer } from "../task-utils";
import type { LiveKitStore, Message, Task } from "../types";
import {
  MaxConsecutiveAutoCompactFailures,
  resolveAutoCompactThreshold,
  shouldAutoCompact,
} from "./auto-compact-policy";
import {
  type BackgroundJobNotificationPart,
  attachBackgroundJobNotificationParts,
  dedupeBackgroundJobNotificationParts,
  getBackgroundJobNotificationParts,
  toBackgroundJobNotificationParts,
} from "./background-job-notification";
import { filterCompletionTools } from "./filter-completion-tools";
import {
  type FinishedRequestSnapshot,
  FlexibleChatTransport,
  type OnStartCallback,
  type PrepareRequestGetters,
} from "./flexible-chat-transport";
import { prepareForkTaskData } from "./fork-task-tools";
import { compactTask, repairMermaid } from "./llm";
import { createModel } from "./models";
import {
  EmptyPendingInput,
  type PendingInput,
  type QueuedUserInput,
  type QueuedUserInputStorage,
  attachUserInputParts,
  detachUserInputParts,
  getQueuedUserInputParts,
} from "./pending-input";
import { TaskTranscriptWriter } from "./task-transcript";
import { scheduleGenerateTitleJob } from "./title-generation";
import { replaceAttemptCompletionWithTodoSubtask } from "./todo-completion-utils";
import {
  computeContextWindowUsage,
  estimateTotalTokens,
  getModelCalibrationFactor,
  getModelCalibrationKey,
} from "./token-utils";

const logger = getLogger("LiveChatKit");
const OverrideMessagesSideEffectTimeoutMs = 12_000;
/** Compaction waits up to this long for an in-flight task-memory extraction. */
const TaskMemorySettleTimeoutMs = 5_000;
const TaskMemorySettlePollIntervalMs = 200;

type GetRecentFilesForCompact = () => MaybePromise<RecentFileState[]>;

function normalizeFailedStreamMessage(
  message: Message | null,
  error: unknown,
): Message | null {
  if (message?.role !== "assistant") {
    return message;
  }

  const errorText = getFailedToolCallErrorText(error);
  const normalizedMessage = {
    ...message,
    parts: message.parts.map((part) => {
      if (!isToolUIPart(part)) {
        return part;
      }

      if (
        part.state === "output-available" ||
        part.state === "output-error" ||
        part.state === "output-denied"
      ) {
        return part;
      }

      if (part.state === "input-available" && isUserInputToolPart(part)) {
        return part;
      }

      const normalizedPart = { ...(part as Record<string, unknown>) };
      normalizedPart.output = undefined;
      normalizedPart.errorText = undefined;
      normalizedPart.approval = undefined;
      if (part.state === "input-streaming") {
        // The input never finished streaming. Keep the partial value only as
        // rawInput (AI SDK's convention for unusable input) so retry strips
        // this call instead of replaying truncated arguments.
        normalizedPart.input = undefined;
        normalizedPart.rawInput = part.input;
      }

      return {
        ...normalizedPart,
        state: "output-error",
        errorText,
      } as unknown as typeof part;
    }),
  };

  return stripOpenAIItemReferencesFromLastStep(normalizedMessage);
}

function getFailedToolCallErrorText(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") {
    return getToolCallCancelErrorMessage("user-abort");
  }

  return error instanceof Error ? error.message : String(error);
}

export type LiveChatKitTaskMemoryOptions = {
  stateStore?: MemoryStateStore<TaskMemoryState>;
};

export type LiveChatKitProjectMemoryOptions = {
  stateStore?: MemoryStateStore<AutoMemoryTaskState>;
  manager: AutoMemoryManager;
};

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
  adaptor: TaskMemoryAdaptor | undefined,
  timeoutMs: number,
): Promise<void> {
  if (!adaptor?.getState().isExtracting) return;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    // Hosts without `waitForTaskDone` have no other chance to call `settle()`.
    await adaptor.settle();
    if (!adaptor.getState().isExtracting) return;
    await new Promise<void>((resolve) =>
      setTimeout(resolve, TaskMemorySettlePollIntervalMs),
    );
  }
  logger.debug("Timed out waiting for the task-memory extraction to settle.");
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

export type LiveChatKitPendingInputOptions = {
  /**
   * Starts a turn carrying the given pending input. Defaults to sending the
   * message on the kit's own chat; hosts that drive their own step loop (the
   * background task executor) must append it synchronously and let the loop
   * send it.
   */
  startTurn?: (message: Message) => void;
  /**
   * Called whenever the input waiting to be delivered changes, so a host can
   * render it.
   */
  onChange?: (pending: PendingInput) => void;
  /**
   * Called synchronously when queued user inputs are taken for a request, right
   * before they become part of the conversation.
   */
  onTakeUserInputs?: (inputs: readonly QueuedUserInput[]) => void;
  /** Persists queued user inputs across host reloads. */
  storage?: QueuedUserInputStorage;
};

/** User inputs attached to one message of a request that is not persisted. */
type InFlightUserInputs = {
  inputs: readonly QueuedUserInput[];
  messageId: string;
  parts: Message["parts"];
};

export type LiveChatKitOptions<T> = {
  backgroundJobManager?: BackgroundJobManager;
  taskId: string;
  /** Known working directory for creating a task before request preparation. */
  cwd?: string;

  abortSignal?: AbortSignal;

  // Request related getters
  getters: PrepareRequestGetters;

  isSubTask?: boolean;
  requestUseCase?: PochiRequestUseCase;
  /** Persist task and message events locally only. Shared file writes are unaffected. */
  persistLocallyOnly?: boolean;
  enableAutoCompact?: boolean;

  store: LiveKitStore;

  blobStore: BlobStore;

  chatClass: new (options: ChatInit<Message>) => T;

  onOverrideMessages?: (options: {
    store: LiveKitStore;
    taskId: string;
    messages: Message[];
    abortSignal: AbortSignal;
  }) => MaybePromise<void>;
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

  onCompactStart?: () => void;

  onCompactFinish?: (success: boolean) => MaybePromise<void>;

  /**
   * Returns recent file contents the model saw before compaction.
   * They are appended to the compact block before onCompactFinish runs.
   */
  getRecentFilesForCompact?: GetRecentFilesForCompact;

  /**
   * Delivery of input that arrives while the agent is busy: user messages
   * queued with `queueUserInput` and finished background job notifications
   * pushed with `enqueueBackgroundJobNotifications`. The kit owns the pending
   * set and when it reaches the model.
   */
  pendingInput?: LiveChatKitPendingInputOptions;

  taskMemory?: LiveChatKitTaskMemoryOptions;

  projectMemory?: LiveChatKitProjectMemoryOptions;

  customAgent?: CustomAgent;
  attemptCompletionSchema?: z.ZodAny;
  systemPromptOverride?: string;
  outputSchema?: z.ZodAny;
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
    readonly status: ChatStatus;
    stop: () => Promise<void>;
    sendMessage: (
      message: { id?: string; parts: Message["parts"] },
      options?: ChatRequestOptions,
    ) => Promise<void>;
  },
> {
  protected readonly taskId: string;
  protected readonly store: LiveKitStore;
  private readonly persistLocallyOnly: boolean;
  protected readonly blobStore: BlobStore;
  private readonly getters: PrepareRequestGetters;
  readonly chat: T;
  private readonly transport: FlexibleChatTransport;
  readonly backgroundJobManager: BackgroundJobManager;
  private readonly taskMemoryAdaptor: TaskMemoryAdaptor | undefined;
  private readonly autoMemoryAdaptor: AutoMemoryAdaptor | undefined;
  private readonly transcriptWriter: TaskTranscriptWriter | undefined;
  private readonly pendingInputOptions:
    | LiveChatKitPendingInputOptions
    | undefined;
  private queuedUserInputs: QueuedUserInput[] = [];
  /**
   * User inputs already added to the conversation for a request that has not
   * persisted it yet. They stay in storage until it does, and go back to the
   * queue when the request fails before that.
   */
  private inFlightUserInputs: InFlightUserInputs[] = [];
  private pendingBackgroundJobNotificationParts: BackgroundJobNotificationPart[] =
    [];
  private pendingInputSnapshot: PendingInput = EmptyPendingInput;
  /** Resolves once stored inputs are loaded; nothing is taken before that. */
  private queuedUserInputsLoad: Promise<void> = Promise.resolve();
  private queuedUserInputsLoaded = true;
  /** Serializes storage reads and writes, starting with the initial load. */
  private queuedUserInputsStorageTask: Promise<void> = Promise.resolve();
  private readonly pendingMemoryOperations = new Set<Promise<void>>();
  private latestRequestSnapshot: FinishedRequestSnapshot | undefined;
  private currentToolsExecution:
    | { messageId: string; startedAt: Date }
    | undefined = undefined;

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
  private consecutiveAutoCompactFailures = 0;

  /**
   * Converts an existing subtask (created by the newTask middleware) into a
   * background subagent task: records its state and flips `background` so the
   * TaskExecutor picks it up independently of this chat.
   */
  readonly backgroundSubTask: (options: {
    taskId: string;
    agentType?: string;
  }) => Promise<void>;

  constructor({
    taskId,
    cwd,
    abortSignal,
    store,
    blobStore,
    chatClass,
    onOverrideMessages,
    getters,
    isSubTask,
    requestUseCase,
    persistLocallyOnly = false,
    enableAutoCompact,
    customAgent,
    attemptCompletionSchema,
    onStreamStart,
    onStreamFinish,
    onCompactStart,
    onCompactFinish,
    getRecentFilesForCompact,
    backgroundJobManager,
    pendingInput,
    taskMemory,
    projectMemory,
    systemPromptOverride,
    ...chatInit
  }: LiveChatKitOptions<T>) {
    this.taskId = taskId;
    this.store = store;
    this.persistLocallyOnly = persistLocallyOnly;
    this.blobStore = blobStore;
    this.getters = getters;
    this.pendingInputOptions = pendingInput;
    this.loadQueuedUserInputs();
    this.onStreamStart = onStreamStart;
    this.onStreamFinish = onStreamFinish;
    this.backgroundJobManager =
      backgroundJobManager ?? BackgroundJobManager.forStore(store);
    this.backgroundSubTask = (options) =>
      this.backgroundJobManager.backgroundSubTask(
        { ...options, parentTaskId: this.taskId },
        abortSignal,
      );
    this.taskMemoryAdaptor =
      taskMemory && !isSubTask
        ? this.backgroundJobManager.getTaskMemory(taskId, taskMemory)
        : undefined;
    const isTopLevelTask = !isSubTask && !isForkAgentUseCase(requestUseCase);
    this.autoMemoryAdaptor =
      projectMemory && isTopLevelTask
        ? this.backgroundJobManager.getAutoMemory(taskId, projectMemory)
        : undefined;
    this.transcriptWriter =
      projectMemory && isTopLevelTask
        ? new TaskTranscriptWriter({
            taskId,
            store,
            manager: projectMemory.manager,
          })
        : undefined;

    this.transport = new FlexibleChatTransport({
      store,
      blobStore,
      onStart: this.onStart,
      getters,
      isSubTask,
      requestUseCase,
      customAgent,
      attemptCompletionSchema,
      systemPromptOverride,
      onRequestFinished: (snapshot) => {
        this.latestRequestSnapshot = snapshot;
      },
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

    abortSignal?.throwIfAborted();
    abortSignal?.addEventListener(
      "abort",
      () => {
        logger.warn("Chat abort signal received; stopping transport", {
          abortOrigin: "external-abort-signal",
          taskId: this.taskId,
        });
        this.chat.stop();
      },
      { once: true },
    );

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
      // Persist an actual submission before environment or memory loading can
      // fail. Hosts without a known cwd still initialize in onStart.
      if (lastMessage && cwd !== undefined) {
        this.ensureInited(cwd);
      }
      const isManualCompact =
        lastMessage?.role === "user" &&
        lastMessage.metadata?.kind === "user" &&
        lastMessage.metadata.compact === true;

      const canAutoCompact = enableAutoCompact === true;
      const isAutoCompact =
        canAutoCompact &&
        !isManualCompact &&
        this.consecutiveAutoCompactFailures <
          MaxConsecutiveAutoCompactFailures &&
        shouldAutoCompact({
          messages,
          llm: getters.getLLM(),
          task: this.task,
          estimatedTotalTokens: estimateTotalTokens(
            formatters.llm(messages),
            getModelCalibrationFactor(getModelCalibrationKey(getters.getLLM())),
          ),
          effectiveContextWindow: getters.getEffectiveContextWindow?.(),
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
            this.taskMemoryAdaptor,
            TaskMemorySettleTimeoutMs,
          );
          const model = createModel({
            llm: getters.getLLM(),
            taskId: this.taskId,
          });
          const taskMemoryBoundaryMessageId =
            await this.taskMemoryAdaptor?.takeCompactionBoundaryMessageId();
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
            storeId: this.store.storeId,
            model,
            messages,
            recentFiles: await readRecentFilesForCompact(
              getRecentFilesForCompact,
            ),
            taskMemoryBoundaryMessageId,
            abortSignal,
            inline: true,
            store: this.store,
            persistLocallyOnly: this.persistLocallyOnly,
            useCase: isAutoCompact ? "auto-compact-task" : "compact-task",
          });
          this.updateTotalTokensEstimate(messages);
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
      try {
        // Attach after compaction, but before checkpoint hooks so they update
        // the final message that this request will send and persist.
        await this.attachPendingInput(abortSignal);

        // Append a complete reminder through the same pre-request flow as other
        // messages. Normal user-message environment injection stays in transport.
        if (
          getters.getEnvironment &&
          prompts.shouldAppendEnvironmentMessage(this.chat.messages)
        ) {
          this.chat.messages = prompts.injectEnvironment(
            this.chat.messages,
            await getters.getEnvironment(),
          ) as Message[];
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
                messages: this.chat.messages,
                abortSignal,
              });
            },
          });
        }
      } catch (err) {
        // Nothing reached the store: the request never starts.
        this.restoreInFlightUserInputs();
        throw err;
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
          this.taskMemoryAdaptor,
          TaskMemorySettleTimeoutMs,
        );
        const model = createModel({
          llm: getters.getLLM(),
          taskId: this.taskId,
        });
        const taskMemoryBoundaryMessageId =
          await this.taskMemoryAdaptor?.takeCompactionBoundaryMessageId();
        const summary = await compactTask({
          blobStore: this.blobStore,
          taskId: this.taskId,
          storeId: this.store.storeId,
          model,
          messages,
          recentFiles: await readRecentFilesForCompact(
            getRecentFilesForCompact,
          ),
          taskMemoryBoundaryMessageId,
          store: this.store,
          persistLocallyOnly: this.persistLocallyOnly,
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
      const model = createModel({
        llm: getters.getLLM(),
        taskId: this.taskId,
      });
      await repairMermaid({
        store: this.store,
        persistLocallyOnly: this.persistLocallyOnly,
        taskId: this.taskId,
        model,
        messages: this.chat.messages,
        chart,
        error,
      });

      this.chat.messages = this.messages;
    };
  }

  private commitTaskEvents(...batch: TaskEvent[]) {
    this.store.commit(...taskEvents(this.persistLocallyOnly, batch));
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

    this.commitTaskEvents(
      ...taskInitEvents({
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

  /**
   * Creates the task row if it does not exist yet.
   *
   * Tasks opened without any seed content are created lazily, so that an empty
   * panel the user never sends a message in is not persisted (and synced).
   */
  ensureInited(cwd: string | undefined) {
    if (this.inited) return;

    this.commitTaskEvents(
      ...taskInitEvents({
        id: this.taskId,
        cwd,
        createdAt: new Date(),
      }),
    );
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

  get latestSystemPrompt(): string | undefined {
    return this.latestRequestSnapshot?.systemPrompt;
  }

  /** The input waiting to be delivered to the model. */
  get pendingInput(): PendingInput {
    return this.pendingInputSnapshot;
  }

  /**
   * Queues a user message that arrived while the agent is busy. It is
   * delivered with the next request that goes out anyway, such as the
   * continuation after tool calls, or by `flushPendingInput` once the agent
   * has nothing left to do.
   *
   * @returns the id of the queued input.
   */
  queueUserInput = (input: Omit<QueuedUserInput, "id">): string => {
    const id = crypto.randomUUID();
    this.setQueuedUserInputs([...this.queuedUserInputs, { ...input, id }]);
    return id;
  };

  /**
   * Removes a queued user input before it is delivered, e.g. to edit it.
   *
   * @returns the removed input, or undefined when it is no longer queued.
   */
  removeUserInput = (id: string): QueuedUserInput | undefined => {
    const input = this.queuedUserInputs.find((item) => item.id === id);
    if (!input) return undefined;
    this.setQueuedUserInputs(
      this.queuedUserInputs.filter((item) => item !== input),
    );
    return input;
  };

  private setQueuedUserInputs(inputs: QueuedUserInput[], persist = true) {
    this.queuedUserInputs = inputs;
    if (persist) this.saveQueuedUserInputs();
    this.notifyPendingInputChange();
  }

  private loadQueuedUserInputs() {
    const storage = this.pendingInputOptions?.storage;
    if (!storage) return;
    this.queuedUserInputsLoaded = false;
    this.queuedUserInputsLoad = storage
      .load()
      .then((stored) => {
        // Inputs queued while loading were queued after the stored ones.
        const known = new Set(this.queuedUserInputs.map((input) => input.id));
        const restored = stored.filter((input) => !known.has(input.id));
        this.queuedUserInputs = [...restored, ...this.queuedUserInputs];
      })
      .catch((err) => {
        logger.warn("Failed to load queued user inputs", err);
      })
      .finally(() => {
        this.queuedUserInputsLoaded = true;
        // Always publish, so a host waiting to flush retries once loaded.
        this.notifyPendingInputChange();
      });
    this.queuedUserInputsStorageTask = this.queuedUserInputsLoad;
  }

  private queuedUserInputsSaveScheduled = false;

  private saveQueuedUserInputs() {
    const storage = this.pendingInputOptions?.storage;
    if (!storage || this.queuedUserInputsSaveScheduled) return;
    this.queuedUserInputsSaveScheduled = true;
    // Chained after the initial load, so a save never drops stored inputs,
    // and coalesced so the latest queue is written once.
    this.queuedUserInputsStorageTask = this.queuedUserInputsStorageTask
      .then(() => {
        this.queuedUserInputsSaveScheduled = false;
        // In-flight inputs stay stored until the conversation holds them, so
        // a reload before that delivers them again instead of losing them.
        return storage.save([
          ...this.inFlightUserInputs.flatMap((entry) => entry.inputs),
          ...this.queuedUserInputs,
        ]);
      })
      .catch((err) => {
        logger.warn("Failed to save queued user inputs", err);
      });
  }

  /**
   * Takes every queued user input for the request that is about to go out.
   * The caller must track them with `trackInFlightUserInputs`.
   */
  private takeQueuedUserInputs(): QueuedUserInput[] {
    const inputs = this.queuedUserInputs;
    if (inputs.length === 0 || !this.queuedUserInputsLoaded) return [];
    // Storage is unchanged: the inputs are in flight, not delivered yet.
    this.setQueuedUserInputs([], false);
    try {
      this.pendingInputOptions?.onTakeUserInputs?.(inputs);
    } catch (err) {
      logger.warn("onTakeUserInputs callback threw", err);
    }
    return inputs;
  }

  private trackInFlightUserInputs(entry: InFlightUserInputs) {
    if (entry.inputs.length === 0) return;
    this.inFlightUserInputs = [...this.inFlightUserInputs, entry];
  }

  /** The conversation holding the in-flight inputs was persisted. */
  private commitInFlightUserInputs() {
    if (this.inFlightUserInputs.length === 0) return;
    this.inFlightUserInputs = [];
    this.saveQueuedUserInputs();
  }

  /**
   * Takes in-flight inputs back out of the conversation and puts them in front
   * of the queue, after their request failed before persisting them.
   */
  private restoreInFlightUserInputs(
    entries: readonly InFlightUserInputs[] = this.inFlightUserInputs,
  ) {
    const restoring = entries.filter((entry) =>
      this.inFlightUserInputs.includes(entry),
    );
    if (restoring.length === 0) return;
    this.inFlightUserInputs = this.inFlightUserInputs.filter(
      (entry) => !restoring.includes(entry),
    );

    let messages = this.chat.messages;
    for (const entry of restoring) {
      messages =
        detachUserInputParts(messages, entry.messageId, entry.parts) ??
        messages;
    }
    if (messages !== this.chat.messages) this.chat.messages = messages;

    const known = new Set(this.queuedUserInputs.map((input) => input.id));
    const restored = restoring
      .flatMap((entry) => entry.inputs)
      .filter((input) => !known.has(input.id));
    this.setQueuedUserInputs([...restored, ...this.queuedUserInputs]);
  }

  private notifyPendingInputChange() {
    this.pendingInputSnapshot = {
      userInputs: this.queuedUserInputs,
      notifications: this.pendingBackgroundJobNotificationParts,
    };
    try {
      this.pendingInputOptions?.onChange?.(this.pendingInputSnapshot);
    } catch (err) {
      logger.warn("pendingInput.onChange callback threw", err);
    }
  }

  /**
   * Hands background job results and monitor batches to the kit. They are
   * delivered with the next request that goes out anyway, or by
   * `flushPendingInput` when the agent has nothing left to do.
   *
   * Notifications already pending or already part of the conversation are
   * ignored, so a host may keep pushing the same ones until it observes them
   * delivered.
   */
  enqueueBackgroundJobNotifications = (
    notifications: readonly BackgroundJobNotification[],
  ): void => {
    this.enqueueBackgroundJobNotificationParts(
      toBackgroundJobNotificationParts(notifications),
    );
  };

  private enqueueBackgroundJobNotificationParts(
    parts: readonly BackgroundJobNotificationPart[],
  ): void {
    const canNotify = (part: BackgroundJobNotificationPart) =>
      !this.backgroundJobManager.isNotificationSilenced(
        part.data.backgroundJobId,
      );
    const delivered = [
      ...this.chat.messages.flatMap((message) => message.parts),
      ...this.messages.flatMap((message) => message.parts),
    ];
    // Another chat instance may have consumed a source head while this view
    // was idle. Prune that local copy before accepting the promoted head.
    const pending = dedupeBackgroundJobNotificationParts(
      this.pendingBackgroundJobNotificationParts.filter(canNotify),
      delivered,
    );
    const added = dedupeBackgroundJobNotificationParts(
      parts.filter(canNotify),
      [...delivered, ...pending],
    );
    if (
      added.length === 0 &&
      pending.length === this.pendingBackgroundJobNotificationParts.length
    )
      return;

    this.setPendingBackgroundJobNotifications([...pending, ...added]);
  }

  private setPendingBackgroundJobNotifications(
    parts: BackgroundJobNotificationPart[],
  ) {
    this.pendingBackgroundJobNotificationParts = parts;
    this.notifyPendingInputChange();
  }

  private takePendingBackgroundJobNotifications(
    existingParts: readonly Message["parts"][number][] = [],
    automatic = false,
  ) {
    const pending = dedupeBackgroundJobNotificationParts(
      this.pendingBackgroundJobNotificationParts,
      this.chat.messages.flatMap((message) => message.parts),
    );
    const notifications = pending.map((part) => part.data);
    // A notification-only turn already selected a batch before sendMessage.
    // Its request hook can add more events only within the same request budget.
    const existingCharacters = getBackgroundJobNotificationParts(existingParts)
      .flatMap((part) => (part.data.kind === "monitor" ? [part.data] : []))
      .flatMap((batch) => batch.lines)
      .reduce((total, line) => total + line.length, 0);
    const ready = this.backgroundJobManager.takeReadyNotifications(
      this.taskId,
      notifications,
      MonitorMaxDeliveryCharacters - existingCharacters,
      automatic,
    );
    const ids = new Set(ready.map((notice) => notice.notificationId));
    const remaining = notifications.filter(
      (notice) => !ids.has(notice.notificationId),
    );
    if (
      ready.length ||
      pending.length !== this.pendingBackgroundJobNotificationParts.length
    ) {
      this.setPendingBackgroundJobNotifications(
        toBackgroundJobNotificationParts(remaining),
      );
    }
    return toBackgroundJobNotificationParts(ready);
  }

  /**
   * Rides all pending input along with the request that is about to go out,
   * so queued user messages and finished background jobs reach the model
   * without costing a turn of their own. User inputs come first.
   */
  private async attachPendingInput(abortSignal: AbortSignal) {
    const notifications =
      await this.backgroundJobManager.snapshotPendingNotifications(this.taskId);
    // Inputs queued before the stored ones were loaded must not overtake them.
    await this.queuedUserInputsLoad;
    abortSignal.throwIfAborted();
    this.enqueueBackgroundJobNotifications(notifications);

    let messages = this.chat.messages;
    const userInputs = this.takeQueuedUserInputs();
    const userParts = getQueuedUserInputParts(userInputs);
    const withUserParts = attachUserInputParts(messages, userParts);
    if (withUserParts) {
      messages = withUserParts;
      this.trackInFlightUserInputs({
        inputs: userInputs,
        // biome-ignore lint/style/noNonNullAssertion: attaching adds a message or extends the last one.
        messageId: messages.at(-1)!.id,
        parts: userParts,
      });
    }

    if (this.pendingBackgroundJobNotificationParts.length > 0) {
      const lastMessage = messages.at(-1);
      const existingParts =
        lastMessage?.role === "user" ? lastMessage.parts : [];
      messages =
        attachBackgroundJobNotificationParts(
          messages,
          this.takePendingBackgroundJobNotifications(existingParts),
        ) ?? messages;
    }

    if (messages !== this.chat.messages) {
      this.chat.messages = messages;
    }
  }

  /**
   * Delivers all pending input when no request is going to carry it, for
   * instance once the agent has stopped.
   *
   * @returns true when a turn was started for it.
   */
  flushPendingInput = ({
    automatic = true,
  }: { automatic?: boolean } = {}): boolean => {
    this.enqueueBackgroundJobNotifications(
      this.backgroundJobManager.getPendingNotifications(this.taskId),
    );
    const hasUserInputs = this.queuedUserInputs.length > 0;
    if (
      !hasUserInputs &&
      this.pendingBackgroundJobNotificationParts.length === 0
    )
      return false;

    // An unanswered follow-up question owns this turn: a notification sent now
    // would answer in the user's place and hide the question. Queued user
    // input is the user's answer, so it still goes out.
    if (!hasUserInputs && isAwaitingFollowupAnswer(this.chat.messages.at(-1)))
      return false;

    // Read the live SDK state: the host may still hold an idle render from
    // before another sender synchronously started a request.
    if (this.chat.status === "submitted" || this.chat.status === "streaming")
      return false;

    // Stored inputs go first; the load publishes a change when it finishes.
    if (!this.queuedUserInputsLoaded) return false;

    const userInputs = this.takeQueuedUserInputs();
    // A user turn goes out anyway, so notifications ride along with it like
    // with any other request instead of waiting for their wake-up.
    const notificationParts = this.takePendingBackgroundJobNotifications(
      [],
      automatic && userInputs.length === 0,
    );
    const parts = [
      ...getQueuedUserInputParts(userInputs),
      ...notificationParts,
    ];
    if (parts.length === 0) return false;

    const undoWakeup =
      automatic &&
      userInputs.length === 0 &&
      notificationParts.some((part) => part.data.kind === "monitor")
        ? this.backgroundJobManager.startNotificationTurn(this.taskId)
        : () => {};
    const message: Message = { id: crypto.randomUUID(), role: "user", parts };
    const inFlight: InFlightUserInputs = {
      inputs: userInputs,
      messageId: message.id,
      parts: getQueuedUserInputParts(userInputs),
    };
    this.trackInFlightUserInputs(inFlight);
    const startTurn = this.pendingInputOptions?.startTurn;
    const failed = (error: unknown) => {
      undoWakeup();
      // A no-op once the conversation was persisted: then the message is
      // delivered even if its request failed, and restoring would repeat it.
      this.restoreInFlightUserInputs([inFlight]);
      // Only persistence in the conversation acknowledges the source queue,
      // and re-enqueueing skips notifications the conversation already holds.
      this.enqueueBackgroundJobNotificationParts(notificationParts);
      logger.warn("Failed to send pending input", error);
    };
    try {
      if (startTurn) startTurn(message);
      else
        void this.chat
          .sendMessage({ id: message.id, parts: message.parts })
          .catch(failed);
    } catch (error) {
      failed(error);
      return false;
    }
    return true;
  };

  updateIsPublicShared = (isPublicShared: boolean) => {
    this.commitTaskEvents(
      events.updateIsPublicShared({
        id: this.taskId,
        isPublicShared,
        updatedAt: new Date(),
      }),
    );
  };

  markAsFailed = (error: Error) => {
    this.commitTaskEvents(
      events.taskFailed({
        id: this.taskId,
        error: toTaskError(error),
        updatedAt: new Date(),
      }),
    );
  };

  /**
   * Mark the start of a tool-calls execution.
   */
  markStartToolsExecution = () => {
    const messages = this.messages;
    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage?.role === "assistant" &&
      lastMessage.parts.some(
        (p) =>
          "toolCallId" in p && p.toolCallId && p.state === "input-available",
      )
    ) {
      this.currentToolsExecution = {
        messageId: lastMessage.id,
        startedAt: new Date(),
      };
    }
  };

  /** Save each returned tool result before the rest of the batch completes. */
  persistToolOutput = () => {
    const messages = this.chat.messages;
    const message = this.currentToolsExecution
      ? messages.find(
          (message) => message.id === this.currentToolsExecution?.messageId,
        )
      : messages.findLast((message) => message.role === "assistant");
    if (message)
      this.commitTaskEvents(
        events.toolsExecutionFinished({
          id: message.id,
          parts: message.parts,
          duration: Duration.millis(0),
        }),
      );
  };

  /** Record the duration once for the entire batch. */
  markEndToolsExecution = () => {
    const toolsExecution = this.currentToolsExecution;
    this.currentToolsExecution = undefined;
    if (toolsExecution) {
      const duration = Date.now() - toolsExecution.startedAt.getTime();
      const messages = this.chat.messages;
      const messageToUpdate = messages.find(
        (message) => message.id === toolsExecution.messageId,
      );
      if (messageToUpdate) {
        const updatedMessages = messages.map((message) =>
          message.id === toolsExecution.messageId
            ? ({
                ...message,
                metadata: {
                  ...message.metadata,
                  totalToolsExecutionDuration:
                    message.metadata?.kind === "assistant" &&
                    message.metadata.totalToolsExecutionDuration !== undefined
                      ? message.metadata.totalToolsExecutionDuration + duration
                      : duration,
                },
              } as Message)
            : message,
        );
        this.commitTaskEvents(
          events.toolsExecutionFinished({
            id: toolsExecution.messageId,
            parts: messageToUpdate.parts,
            duration: Duration.millis(duration),
          }),
        );
        this.chat.messages = updatedMessages;
      }
    }
  };

  fork = (
    sourceStore: LiveKitStore,
    forkTaskParams: {
      taskId: string;
      title: string | undefined;
      messageId: string;
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
      messageId: forkTaskParams.messageId,
      newTaskId: this.taskId,
      newTaskTitle: forkTaskParams.title,
    });

    // A user fork also imports shared files, so it bypasses task-only persistence.
    this.store.commit(...forkTaskInitEvents(data));
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
      this.ensureInited(environment?.info.cwd);

      const { task } = this;
      if (!task) {
        throw new Error("Task not found");
      }

      const llm = getters.getLLM();
      if (task.background && task.parentId && !task.title) {
        const parentMessages = store
          .query(makeMessagesQuery(task.parentId))
          .map((row) => row.data as Message);
        const description = getSubAgentInvocation(
          this.taskId,
          parentMessages,
        )?.description;
        if (description) {
          this.commitTaskEvents(
            events.updateTitle({
              id: this.taskId,
              title: description,
              updatedAt: new Date(),
            }),
          );
        }
      }
      if (!task.background) {
        const getModel = () => createModel({ llm, taskId: this.taskId });
        const writer = this.transcriptWriter;
        scheduleGenerateTitleJob({
          taskId: this.taskId,
          store,
          blobStore: this.blobStore,
          messages,
          getModel,
          onTitleUpdated:
            writer &&
            ((previousTask) =>
              this.trackMemoryOperation(writer.refreshTitle(previousTask))),
        });
      }

      this.commitTaskEvents(
        events.chatStreamStarted({
          id: this.taskId,
          data: lastMessage,
          todos: environment?.todos || [],
          git: toTaskGitInfo(environment?.workspace.gitStatus),
          updatedAt: new Date(),
          modelId: llm.id,
        }),
      );
      this.commitInFlightUserInputs();

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
      logger.warn("Provider reported chat transport abort", {
        abortOrigin: "provider-isAbort",
        taskId: this.taskId,
        assistantMessageId: originalMessage.id,
      });
      return this.onError(abortError);
    }

    if (isError) return; // handled in onError already.

    const filteredMessage = filterCompletionTools(originalMessage);
    const message = this.getters.isTodoModeActive?.()
      ? prepareAttemptTodoCompletionSubtask({
          message: filteredMessage,
          task: this.task,
          taskId: this.taskId,
          store: this.store,
        })
      : filteredMessage;

    // Replace the streamed assistant message only when it is the last one;
    // otherwise append so an early-abort empty stream can't drop the user message.
    const lastMessage = this.chat.messages.at(-1);
    this.chat.messages =
      lastMessage?.id === message.id
        ? [...this.chat.messages.slice(0, -1), message]
        : [...this.chat.messages, message];

    if (message.metadata?.kind !== "assistant") {
      return this.onError(abortError);
    }

    const finishReason = streamFinishReason ?? message.metadata?.finishReason;
    const status = toTaskStatus(message, finishReason);

    // Calibration is now handled directly in `flexible-chat-transport.ts`,
    // where it can compare the provider's real `inputTokens` against the
    // pre-request input-only estimate for that same model. Doing it there
    // (rather than here against `totalTokens`) avoids contaminating the
    // calibration with invisible reasoning tokens, which show up in
    // output/completion usage but have no corresponding visible text for us
    // to estimate from.
    const contextWindowUsage = computeContextWindowUsage(
      formatters.llm(this.chat.messages),
      this.latestRequestSnapshot,
    );

    let duration = undefined;
    if (
      message.metadata?.kind === "assistant" &&
      message.metadata.totalStreamingDuration !== undefined
    ) {
      duration = Duration.millis(
        message.metadata.totalStreamingDuration +
          (message.metadata.totalToolsExecutionDuration ?? 0),
      );
    }

    this.commitTaskEvents(
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

    const finishData = {
      id: this.taskId,
      cwd: this.task?.cwd ?? null,
      status,
      messages: [...this.chat.messages],
      contextWindowUsage,
    };

    this.scheduleTranscriptWrite(finishData);
    this.scheduleMemoryUpdate(finishData);

    this.onStreamFinish?.(finishData);
  };

  private async settleMemoryAndMaybeContinue(
    abortSignal?: AbortSignal,
  ): Promise<boolean> {
    await this.waitForMemoryOperations();
    await this.taskMemoryAdaptor?.settle();
    // Continuing memory extraction may create a new fork. It needs a completed
    // request from this parent instance to reuse, including when the CLI drains.
    if (!this.latestRequestSnapshot || abortSignal?.aborted) return false;
    return (await this.autoMemoryAdaptor?.settleAndMaybeContinue()) ?? false;
  }

  private async waitForMemoryOperations(): Promise<void> {
    while (this.pendingMemoryOperations.size > 0) {
      await Promise.allSettled([...this.pendingMemoryOperations]);
    }
  }

  async drainBackgroundTasksAndSettleMemory(
    options: { timeoutMs?: number; abortSignal?: AbortSignal } = {},
  ): Promise<void> {
    if (options.timeoutMs === 0 || options.abortSignal?.aborted) return;
    const controller = new AbortController();
    const signal = options.abortSignal
      ? AbortSignal.any([controller.signal, options.abortSignal])
      : controller.signal;
    const timeout =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => controller.abort(), options.timeoutMs);
    let onAbort: () => void = () => {};
    const aborted = new Promise<void>((resolve) => {
      onAbort = resolve;
      signal.addEventListener("abort", onAbort, { once: true });
    });
    const drain = async () => {
      await this.waitForMemoryOperations();
      if (signal.aborted) return;
      await this.backgroundJobManager.drain(signal);
      while (
        !signal.aborted &&
        (await this.settleMemoryAndMaybeContinue(signal))
      ) {
        await this.backgroundJobManager.drain(signal);
      }
      if (!signal.aborted) await this.settleMemoryAndMaybeContinue(signal);
    };
    try {
      await Promise.race([drain(), aborted]);
    } finally {
      if (timeout) clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
    }
  }

  /** Subscribing a chat never starts or owns the shared executor. */
  subscribeBackgroundJobs(): () => void {
    return this.backgroundJobManager.subscribeNotifications(
      this.taskId,
      (notifications, wakeup) => {
        this.enqueueBackgroundJobNotifications(notifications);
        if (wakeup) {
          // The timer changed readiness, not the notification IDs. Publish a
          // fresh pending array so the host retries its guarded idle flush.
          this.setPendingBackgroundJobNotifications([
            ...this.pendingBackgroundJobNotificationParts,
          ]);
        }
      },
    );
  }

  private getAutoCompactThreshold(): number | undefined {
    try {
      return resolveAutoCompactThreshold({
        llm: this.getters.getLLM(),
        effectiveContextWindow: this.getters.getEffectiveContextWindow?.(),
      });
    } catch (error) {
      logger.debug("Failed to resolve the auto-compact threshold", error);
      return undefined;
    }
  }

  private scheduleTranscriptWrite(data: {
    messages: Message[];
    status: string;
  }) {
    if (!this.transcriptWriter) return;
    this.trackMemoryOperation(this.transcriptWriter.write(data));
  }

  private trackMemoryOperation(promise: Promise<void>) {
    const tracked = promise.finally(() => {
      this.pendingMemoryOperations.delete(tracked);
    });
    this.pendingMemoryOperations.add(tracked);
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
        compactThreshold: this.getAutoCompactThreshold(),
        systemPrompt: this.latestRequestSnapshot?.systemPrompt,
      }),
      this.autoMemoryAdaptor?.update({
        messages: data.messages,
        status: data.status,
        systemPrompt: this.latestRequestSnapshot?.systemPrompt,
      }),
    ])
      .catch((error) => {
        logger.warn("Memory update failed", error);
      })
      .then(() => undefined);

    this.trackMemoryOperation(promise);
  }

  private updateTotalTokensEstimate(messages: Message[]) {
    this.commitTaskEvents(
      events.updateTotalTokens({
        id: this.taskId,
        totalTokens: estimateTotalTokens(
          formatters.llm(messages),
          getModelCalibrationFactor(
            getModelCalibrationKey(this.getters.getLLM()),
          ),
        ),
        updatedAt: new Date(),
      }),
    );
  }

  private async handleCompactFinish(
    success: boolean,
    onCompactFinish: ((success: boolean) => MaybePromise<void>) | undefined,
  ) {
    try {
      await onCompactFinish?.(success);
    } catch (notifyErr) {
      logger.warn("onCompactFinish callback threw", notifyErr);
    }
  }

  private readonly onError: ChatOnErrorCallback = (error) => {
    logger.error("onError", error);
    const rawLastMessage = this.chat.messages.at(-1) || null;
    const lastMessage = normalizeFailedStreamMessage(rawLastMessage, error);
    if (lastMessage && rawLastMessage) {
      this.chat.messages = [...this.chat.messages.slice(0, -1), lastMessage];
    }

    let duration = undefined;
    if (
      lastMessage?.metadata?.kind === "assistant" &&
      lastMessage.metadata.totalStreamingDuration !== undefined
    ) {
      duration = Duration.millis(
        lastMessage.metadata.totalStreamingDuration +
          (lastMessage.metadata.totalToolsExecutionDuration ?? 0),
      );
    }

    this.commitTaskEvents(
      events.chatStreamFailed({
        id: this.taskId,
        error: toTaskError(error),
        data: lastMessage,
        updatedAt: new Date(),
        duration,
        lastCheckpointHash: getCleanCheckpoint(this.chat.messages),
      }),
    );
    // A request that fails or is stopped before it started still persists
    // its last message, which holds the in-flight inputs.
    if (lastMessage) this.commitInFlightUserInputs();

    this.scheduleTranscriptWrite({
      messages: [...this.chat.messages],
      status: "failed",
    });

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
/**
 * Whether a message part is a tool call that may have modified files, i.e. a
 * write tool or a non-read-only execute tool. A read-only command (e.g. `echo`
 * or `ls`) does not dirty the working tree relative to the last checkpoint, so
 * it must not invalidate it.
 */
const isDirtyingToolPart = (part: Message["parts"][number]): boolean => {
  if (!isToolUIPart(part)) {
    return false;
  }
  const toolName = getToolName(part);
  if (
    !ToolsByPermission.write.includes(toolName) &&
    !ToolsByPermission.execute.includes(toolName)
  ) {
    return false;
  }
  return !isReadonlyToolCall(toolName, part.input);
};

export const getCleanCheckpoint = (messages: Message[]) => {
  const lastPart = messages
    .flatMap((m) => m.parts)
    .filter((p) => p.type === "data-checkpoint" || isDirtyingToolPart(p))
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
