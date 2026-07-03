import {
  type BackgroundTaskState,
  type MaybePromise,
  getLogger,
  prompts,
  toErrorMessage,
} from "@getpochi/common";
import {
  isAssistantMessageWithEmptyParts,
  isAssistantMessageWithNoToolCalls,
  isAssistantMessageWithPartialToolCalls,
  prepareLastMessageForRetry,
} from "@getpochi/common/message-utils";
import {
  type BatchedToolCallResult,
  type CompiledToolPolicies,
  ToolCallQueue,
  compileToolPolicies,
  getAllowedToolNames,
  getToolCallCancelErrorMessage,
  isUserInputToolPart,
  validateToolPolicy,
} from "@getpochi/tools";
import {
  type AbstractChat,
  type ToolUIPart,
  getStaticToolName,
  isStaticToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import type { BlobStore } from "../../blob-store";
import type { PrepareRequestGetters } from "../../chat/flexible-chat-transport";
import { defaultCatalog as catalog } from "../../livestore";
import type { LiveKitStore, Message, Task } from "../../types";

const logger = getLogger("TaskExecutor");

const TaskExecutorMaxStep = 50;
const TaskExecutorMaxRetry = 8;
const TaskExecutorMaxToolRejections = 5;
const TaskExecutorMaxConcurrency = 10;

interface TaskExecutorToolCallExecution {
  taskId: string;
  parentTaskId: string | undefined;
  storeId: string;
  toolName: string;
  toolCallId: string;
  input: unknown;
  abortSignal: AbortSignal;
  toolPolicies: CompiledToolPolicies | undefined;
}

export interface RunningTaskAdaptor {
  waitUntilReady?(): Promise<void>;
  getRequestGetters(context: {
    taskId: string;
    cwd: string | undefined;
  }): PrepareRequestGetters;
  executeToolCall(args: TaskExecutorToolCallExecution): Promise<unknown>;
  onTaskError?(taskId: string, error: Error): MaybePromise<void>;
}

type TaskToolOutput = {
  tool: string;
  toolCallId: string;
  output: unknown;
};

type CreateTaskExecutorOptions = {
  store: LiveKitStore;
  blobStore: BlobStore;
  readTaskState: (
    taskId: string,
  ) => MaybePromise<BackgroundTaskState | undefined>;
  adaptor: RunningTaskAdaptor;
  clearFileStateCache?: (taskId: string) => MaybePromise<void>;
  createChatKit: CreateRunningTaskChatKit;
};

type RunningTaskChat = {
  messages: Message[];
  stop: () => Promise<void>;
  sendMessage: () => Promise<void>;
  addToolOutput: AbstractChat<Message>["addToolOutput"];
  appendOrReplaceMessage: (message: Message) => void;
};

type RunningTaskChatKit = {
  chat: RunningTaskChat;
  task?: Task;
  markAsFailed: (error: Error) => MaybePromise<void>;
};

type CreateRunningTaskChatKit = (options: {
  taskId: string;
  store: LiveKitStore;
  blobStore: BlobStore;
  abortSignal: AbortSignal;
  requestUseCase: BackgroundTaskState["useCase"];
  getters: PrepareRequestGetters;
}) => RunningTaskChatKit;

export class TaskExecutor {
  private readonly store: LiveKitStore;
  private readonly blobStore: BlobStore;
  private readonly readTaskState: CreateTaskExecutorOptions["readTaskState"];
  private readonly adaptor: RunningTaskAdaptor;
  private readonly clearFileStateCache: CreateTaskExecutorOptions["clearFileStateCache"];
  private readonly createRunningTaskChatKit: CreateRunningTaskChatKit;
  private readonly runningTasks = new Map<string, RunningTask>();
  private readonly taskDoneWaiters = new Map<string, Set<() => void>>();
  private unsubscribe: (() => void) | undefined;
  private started = false;
  private disposed = false;

  constructor({
    store,
    blobStore,
    readTaskState,
    adaptor,
    clearFileStateCache,
    createChatKit,
  }: CreateTaskExecutorOptions) {
    this.store = store;
    this.blobStore = blobStore;
    this.readTaskState = readTaskState;
    this.adaptor = adaptor;
    this.clearFileStateCache = clearFileStateCache;
    this.createRunningTaskChatKit = createChatKit;
  }

  start() {
    if (this.disposed) return;
    if (this.started) return;
    this.started = true;
    this.unsubscribe = this.store.subscribe(
      catalog.queries.runnableTasks$,
      () => this.reconcileRunnableTasks(),
    );
    this.reconcileRunnableTasks();
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.started = false;
    await Promise.all(
      [...this.runningTasks.values()].map(async (runningTask) => {
        await runningTask.dispose();
        await runningTask.done.catch(() => undefined);
      }),
    );
    this.runningTasks.clear();
    this.resolveAllTaskDoneWaiters();
  }

  async drain() {
    this.start();

    while (true) {
      const runnableTasks = this.readRunnableTasks();
      this.reconcile(runnableTasks);

      if (runnableTasks.length === 0 && this.runningTasks.size === 0) {
        return;
      }

      const activeTasks = [...this.runningTasks.values()];
      await Promise.race([
        ...activeTasks.map((runningTask) =>
          runningTask.done.catch(() => undefined),
        ),
        sleep(100),
      ]);
    }
  }

  waitForTaskDone(taskId: string): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.start();

    if (this.isTaskDone(taskId)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      let waiters = this.taskDoneWaiters.get(taskId);
      if (!waiters) {
        waiters = new Set();
        this.taskDoneWaiters.set(taskId, waiters);
      }
      waiters.add(resolve);
    });
  }

  private readRunnableTasks() {
    return this.store.query(catalog.queries.runnableTasks$);
  }

  private isTaskDone(taskId: string) {
    if (this.runningTasks.has(taskId)) return false;
    const task = this.store.query(catalog.queries.makeTaskQuery(taskId));
    return !!task && !isRunnableTaskStatus(task.status);
  }

  private reconcileRunnableTasks() {
    this.reconcile(this.readRunnableTasks());
  }

  private reconcile(tasks: readonly Task[]) {
    for (const task of tasks) {
      if (this.runningTasks.size >= TaskExecutorMaxConcurrency) {
        return;
      }
      if (!this.runningTasks.has(task.id)) {
        this.startRunningTask(task.id);
      }
    }
  }

  private startRunningTask(taskId: string) {
    if (this.disposed) return;
    const runningTask = new RunningTask({
      taskId,
      store: this.store,
      blobStore: this.blobStore,
      readTaskState: this.readTaskState,
      adaptor: this.adaptor,
      clearFileStateCache: this.clearFileStateCache,
      createChatKit: this.createRunningTaskChatKit,
    });
    this.runningTasks.set(taskId, runningTask);

    runningTask.done
      .catch(async (error) => {
        const normalizedError = toError(error);
        logger.warn(
          { taskId, error: normalizedError },
          "Task execution failed",
        );
        await this.adaptor.onTaskError?.(taskId, normalizedError);
      })
      .finally(() => {
        if (this.runningTasks.get(taskId) === runningTask) {
          this.runningTasks.delete(taskId);
        }
        this.resolveTaskDoneWaiters(taskId);
        if (!this.disposed && this.started) {
          this.reconcileRunnableTasks();
        }
      });
  }

  private resolveTaskDoneWaiters(taskId: string) {
    const waiters = this.taskDoneWaiters.get(taskId);
    if (!waiters) return;
    this.taskDoneWaiters.delete(taskId);
    for (const resolve of waiters) {
      resolve();
    }
  }

  private resolveAllTaskDoneWaiters() {
    for (const taskId of this.taskDoneWaiters.keys()) {
      this.resolveTaskDoneWaiters(taskId);
    }
  }
}

class RunningTask {
  private readonly taskId: string;
  private readonly store: LiveKitStore;
  private readonly blobStore: BlobStore;
  private readonly readTaskState: CreateTaskExecutorOptions["readTaskState"];
  private readonly adaptor: RunningTaskAdaptor;
  private readonly clearFileStateCache: CreateTaskExecutorOptions["clearFileStateCache"];
  private readonly createRunningTaskChatKit: CreateRunningTaskChatKit;
  private readonly abortController = new AbortController();
  private readonly toolCallQueue = new ToolCallQueue();
  private taskState: BackgroundTaskState = {};
  private chatKit: RunningTaskChatKit | undefined;
  private retryCount = 0;
  private toolRejectionCount = 0;
  private disposed = false;

  readonly done: Promise<void>;

  constructor(options: {
    taskId: string;
    store: LiveKitStore;
    blobStore: BlobStore;
    readTaskState: CreateTaskExecutorOptions["readTaskState"];
    adaptor: RunningTaskAdaptor;
    clearFileStateCache?: CreateTaskExecutorOptions["clearFileStateCache"];
    createChatKit: CreateRunningTaskChatKit;
  }) {
    this.taskId = options.taskId;
    this.store = options.store;
    this.blobStore = options.blobStore;
    this.readTaskState = options.readTaskState;
    this.adaptor = options.adaptor;
    this.clearFileStateCache = options.clearFileStateCache;
    this.createRunningTaskChatKit = options.createChatKit;
    this.done = this.run();
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abortController.abort("user-abort");
    await this.toolCallQueue.abort("user-abort");
    await this.chatKit?.chat.stop();
  }

  private async run() {
    try {
      await this.adaptor.waitUntilReady?.();
      this.taskState = (await this.readTaskState(this.taskId)) ?? {};
      this.chatKit = this.createChatKit(this.task);

      while (!this.abortController.signal.aborted) {
        const stepResult = await this.step();
        if (stepResult === "finished") {
          return;
        }

        if (stepResult === "retry") {
          this.retryCount += 1;
          if (this.retryCount > TaskExecutorMaxRetry) {
            throw new Error(
              "The task failed to complete, max retry count reached.",
            );
          }
        } else {
          this.retryCount = 0;
        }

        await this.chat.sendMessage();
      }
    } catch (error) {
      if (this.abortController.signal.aborted) {
        return;
      }
      const normalizedError = toError(error);
      await this.chatKit?.markAsFailed(normalizedError);
      throw normalizedError;
    } finally {
      await this.toolCallQueue.abort("user-abort");
    }
  }

  private get task() {
    return (
      this.store.query(catalog.queries.makeTaskQuery(this.taskId)) ?? undefined
    );
  }

  private get chat() {
    if (!this.chatKit) {
      throw new Error("Task chat is not initialized.");
    }
    return this.chatKit.chat;
  }

  private createChatKit(currentTask: Task | undefined) {
    return this.createRunningTaskChatKit({
      taskId: this.taskId,
      store: this.store,
      blobStore: this.blobStore,
      abortSignal: this.abortController.signal,
      requestUseCase: this.taskState.useCase,
      getters: this.adaptor.getRequestGetters(
        this.createTaskContext(currentTask),
      ),
    });
  }

  private createTaskContext(currentTask: Task | undefined) {
    return {
      taskId: this.taskId,
      cwd: normalizeCwd(this.task?.cwd) ?? normalizeCwd(currentTask?.cwd),
    };
  }

  private async step(): Promise<"finished" | "next" | "retry"> {
    this.throwIfMaxStepReached();

    const lastMessage = this.chat.messages.at(-1);
    if (!lastMessage) {
      throw new Error("No messages in the task chat.");
    }

    return (
      (await this.processMessage(lastMessage)) ??
      (await this.processToolCalls(lastMessage))
    );
  }

  private async processMessage(
    message: Message,
  ): Promise<"finished" | "retry" | undefined> {
    const task = this.task;
    if (!task) {
      throw new Error("Task is not loaded.");
    }

    if (task.status === "completed" || task.status === "pending-input") {
      return "finished";
    }

    if (task.status === "failed") {
      if (isAbortTaskError(task.error)) {
        throw toError(task.error);
      }
      const processed = await this.prepareRetryMessage(message);
      if (processed) {
        this.replaceLastMessageForRetry(processed);
      }
      return "retry";
    }

    if (message.role !== "assistant") {
      return "retry";
    }

    if (
      isAssistantMessageWithEmptyParts(message) ||
      isAssistantMessageWithPartialToolCalls(message) ||
      lastAssistantMessageIsCompleteWithToolCalls({
        messages: this.chat.messages,
      })
    ) {
      const processed = await this.prepareRetryMessage(message);
      if (processed) {
        this.replaceLastMessageForRetry(processed);
      }
      return "retry";
    }

    if (isAssistantMessageWithNoToolCalls(message)) {
      this.chat.appendOrReplaceMessage(
        createUserMessage(
          prompts.createSystemReminder(prompts.toolCallsReminder),
        ),
      );
      return "retry";
    }
  }

  private async processToolCalls(
    message: Message,
  ): Promise<"finished" | "next"> {
    const toolCalls = message.parts
      .filter(isStaticToolUIPart)
      .filter((toolCall) => toolCall.state === "input-available");

    if (toolCalls.length === 0) {
      return "next";
    }

    const executableToolCalls = toolCalls.filter(
      (toolCall) => !isUserInputToolPart(toolCall),
    );

    if (executableToolCalls.length === 0) {
      return "finished";
    }

    for (const toolCall of executableToolCalls) {
      this.toolCallQueue.enqueue({
        toolCallId: toolCall.toolCallId,
        toolName: getStaticToolName(toolCall),
        input: toolCall.input,
        run: () => this.runToolCall(toolCall as ToolUIPart),
        cancel: (reason) =>
          this.addToolOutput({
            tool: getStaticToolName(toolCall),
            toolCallId: toolCall.toolCallId,
            output: { error: getToolCallCancelErrorMessage(reason) },
          }),
      });
    }

    await this.toolCallQueue.start();
    return "next";
  }

  private async runToolCall(
    toolCall: ToolUIPart,
  ): Promise<BatchedToolCallResult> {
    const toolName = getStaticToolName(toolCall);
    const toolPolicies = this.taskState.tools
      ? compileToolPolicies([...this.taskState.tools])
      : undefined;

    try {
      this.validateToolCall(toolName, toolCall.input, toolPolicies);
      this.toolRejectionCount = 0;
    } catch (error) {
      const normalizedError = toError(error);
      await this.addToolOutput({
        tool: toolName,
        toolCallId: toolCall.toolCallId,
        output: { error: normalizedError.message },
      });
      if (
        normalizedError.message.startsWith(
          "The task kept calling disallowed tools",
        )
      ) {
        throw normalizedError;
      }
      return {
        kind: "error",
        error: normalizedError.message,
      };
    }

    try {
      const result = await this.adaptor.executeToolCall({
        taskId: this.taskId,
        parentTaskId: this.taskState.parentTaskId,
        storeId: this.store.storeId,
        toolName,
        toolCallId: toolCall.toolCallId,
        input: toolCall.input,
        abortSignal: this.abortController.signal,
        toolPolicies,
      });

      await this.addToolOutput({
        tool: toolName,
        toolCallId: toolCall.toolCallId,
        output: result,
      });

      const toolError = getToolExecutionError(result);
      if (toolError) {
        return {
          kind: "error",
          error: toolError,
        };
      }

      return { kind: "success" };
    } catch (error) {
      const message = toErrorMessage(error);
      await this.addToolOutput({
        tool: toolName,
        toolCallId: toolCall.toolCallId,
        output: { error: message },
      });
      throw toError(error);
    }
  }

  private validateToolCall(
    toolName: string,
    input: unknown,
    toolPolicies: CompiledToolPolicies | undefined,
  ) {
    const allowedToolsSet = this.taskState.tools
      ? getAllowedToolNames([...this.taskState.tools])
      : undefined;

    if (allowedToolsSet && !allowedToolsSet.has(toolName)) {
      this.toolRejectionCount += 1;
      if (this.toolRejectionCount >= TaskExecutorMaxToolRejections) {
        throw new Error(
          `The task kept calling disallowed tools (${this.toolRejectionCount}). Stopping.`,
        );
      }
      throw new Error(`Tool ${toolName} is not allowed for this task.`);
    }

    validateToolPolicy(toolName, input, toolPolicies, {
      cwd: normalizeCwd(this.task?.cwd) ?? "",
    });
  }

  private async addToolOutput(output: TaskToolOutput) {
    await this.chat.addToolOutput(output as never);
  }

  private replaceLastMessageForRetry(message: Message): void {
    this.chat.appendOrReplaceMessage(message);
  }

  private async prepareRetryMessage(
    message: Message,
  ): Promise<Message | undefined> {
    const retryMessage = await prepareLastMessageForRetry(message, () =>
      this.clearFileStateCache?.(this.taskId),
    );
    return retryMessage ? (retryMessage as Message) : undefined;
  }

  private throwIfMaxStepReached() {
    const stepCount = countStepStarts(this.chat.messages);
    const effectiveStepCount = Math.max(
      0,
      stepCount - (this.taskState.baselineStepCount ?? 0),
    );

    if (effectiveStepCount > TaskExecutorMaxStep) {
      throw new Error("The task failed to complete, max step count reached.");
    }
  }
}

function createUserMessage(prompt: string): Message {
  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [
      {
        type: "text",
        text: prompt,
      },
    ],
  } as Message;
}

function getToolExecutionError(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null || !("error" in result)) {
    return undefined;
  }

  const { error } = result;
  if (error == null) {
    return undefined;
  }

  return toErrorMessage(error);
}

function countStepStarts(messages: ReadonlyArray<Pick<Message, "parts">>) {
  return messages
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "step-start").length;
}

function isAbortTaskError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    error.kind === "AbortError"
  );
}

function normalizeCwd(cwd: string | null | undefined) {
  return cwd ?? undefined;
}

function isRunnableTaskStatus(status: string) {
  return status === "pending-model" || status === "pending-tool";
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error(JSON.stringify(error));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
