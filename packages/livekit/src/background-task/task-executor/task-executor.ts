import {
  type BackgroundTaskState,
  type MaybePromise,
  getLogger,
  isForkAgentUseCase,
  prompts,
  toErrorMessage,
} from "@getpochi/common";
import {
  isAssistantMessageWithEmptyParts,
  isAssistantMessageWithNoToolCalls,
  isAssistantMessageWithPartialToolCalls,
  isAssistantMessageWithStreamingParts,
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
import { isAwaitingFollowupAnswer, isResultMessage } from "../../task-utils";
import type { LiveKitStore, Message, RequestData, Task } from "../../types";

const logger = getLogger("TaskExecutor");

const TaskExecutorMaxStep = 50;
/** Generic subagents run arbitrary work, so they get a higher step budget than memory extraction. */
const TaskExecutorSubagentMaxStep = 256;
const TaskExecutorMaxRetry = 8;
const TaskExecutorMaxToolRejections = 5;
const TaskExecutorMaxConcurrency = 10;
/**
 * Remaining assistant turns at which a step-bounded task starts being warned.
 * The budget is invisible to the model otherwise, so bounded fork agents used
 * to spend their last turn starting an edit they could not finish.
 */
const TaskExecutorStepBudgetReminderThreshold = 2;

interface TaskExecutorToolCallExecution {
  taskId: string;
  parentTaskId: string | undefined;
  storeId: string;
  toolName: string;
  toolCallId: string;
  input: unknown;
  abortSignal: AbortSignal;
  allowBackground?: boolean;
  toolPolicies: CompiledToolPolicies | undefined;
}

export interface RunningTaskAdaptor {
  waitUntilReady?(): Promise<void>;
  getRequestGetters(context: {
    taskId: string;
    cwd: string | undefined;
    omitCustomRules?: boolean;
  }): PrepareRequestGetters;
  /**
   * Resolves a per-task model override (e.g. a subagent's `model` field).
   * Returning undefined keeps the adaptor's default model.
   */
  resolveTaskLLM?(context: {
    taskId: string;
    cwd: string | undefined;
    taskState: BackgroundTaskState;
  }): Promise<RequestData["llm"] | undefined>;
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
  /** Fork agents from a previous Webview/run should be left interrupted. */
  shouldRunForkTask?: (taskId: string) => boolean;
  adaptor: RunningTaskAdaptor;
  clearFileStateCache?: (taskId: string) => MaybePromise<void>;
  createChatKit: CreateRunningTaskChatKit;
  waitForBackgroundJobs?: (
    taskId: string,
    abortSignal: AbortSignal,
  ) => Promise<void>;
  onTaskSettled?: (taskId: string) => void;
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
  markStartToolsExecution: () => void;
  markEndToolsExecution: () => void;
  persistToolOutput: () => void;
  markAsFailed: (error: Error) => MaybePromise<void>;
  subscribeBackgroundJobs: () => () => void;
  flushBackgroundJobNotifications: () => boolean;
};

type CreateRunningTaskChatKit = (options: {
  taskId: string;
  store: LiveKitStore;
  blobStore: BlobStore;
  abortSignal: AbortSignal;
  taskState: BackgroundTaskState;
  getters: PrepareRequestGetters;
  appendMessage: (message: Message) => void;
}) => MaybePromise<RunningTaskChatKit>;

export class TaskExecutor {
  private readonly runningTasks = new Map<string, RunningTask>();
  private readonly taskDoneWaiters = new Map<string, Set<() => void>>();
  private unsubscribe: (() => void) | undefined;
  private started = false;
  private disposed = false;

  constructor(private readonly options: CreateTaskExecutorOptions) {}

  start() {
    if (this.disposed) return;
    if (this.started) return;
    this.started = true;
    this.unsubscribe = this.options.store.subscribe(
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

  async drain(abortSignal?: AbortSignal) {
    this.start();

    while (!this.disposed && !abortSignal?.aborted) {
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

  /**
   * Stops one background task: aborts its running loop and marks it failed
   * with an AbortError so `runnableTasks$` stops matching it. Without the
   * failed status, the next reconcile would pick the task up again.
   */
  async stopTask(taskId: string) {
    const task = this.options.store.query(
      catalog.queries.makeTaskQuery(taskId),
    );
    if (
      task &&
      (isRunnableTaskStatus(task.status) || this.runningTasks.has(taskId))
    ) {
      this.options.store.commit(
        catalog.events.taskFailed({
          id: taskId,
          error: {
            kind: "AbortError",
            message: "Stopped by user.",
          },
          updatedAt: new Date(),
        }),
      );
    }
    const runningTask = this.runningTasks.get(taskId);
    if (runningTask) {
      await runningTask.dispose();
      await runningTask.done.catch(() => undefined);
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

  isTaskRunning(taskId: string) {
    return this.runningTasks.has(taskId);
  }

  private readRunnableTasks() {
    return this.options.store.query(catalog.queries.runnableTasks$);
  }

  private isTaskDone(taskId: string) {
    if (this.runningTasks.has(taskId)) return false;
    const task = this.options.store.query(
      catalog.queries.makeTaskQuery(taskId),
    );
    return !!task && !isRunnableTaskStatus(task.status);
  }

  private reconcileRunnableTasks() {
    this.reconcile(this.readRunnableTasks());
  }

  private reconcile(tasks: readonly Task[]) {
    // Queued tasks may finish or be cancelled before a RunningTask is created.
    for (const taskId of this.taskDoneWaiters.keys()) {
      if (this.isTaskDone(taskId)) this.resolveTaskDoneWaiters(taskId);
    }
    // Tool-triggered cancellation is persisted by the host that owns the store.
    // Abort the active loop as well, so an in-flight request cannot keep running.
    for (const [taskId, runningTask] of this.runningTasks) {
      const task = this.options.store.query(
        catalog.queries.makeTaskQuery(taskId),
      );
      if (task?.status === "failed" && task.error?.kind === "AbortError") {
        void runningTask
          .dispose()
          .catch((error) =>
            logger.warn({ taskId, error }, "Failed to stop cancelled task"),
          );
      }
    }
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
      ...this.options,
      taskId,
    });
    this.runningTasks.set(taskId, runningTask);

    runningTask.done
      .catch(async (error) => {
        const normalizedError = toError(error);
        logger.warn(
          { taskId, error: normalizedError },
          "Task execution failed",
        );
        await this.options.adaptor.onTaskError?.(taskId, normalizedError);
      })
      .finally(() => {
        if (this.runningTasks.get(taskId) === runningTask) {
          this.runningTasks.delete(taskId);
        }
        if (!this.disposed) this.options.onTaskSettled?.(taskId);
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
  private readonly abortController = new AbortController();
  private readonly toolCallQueue = new ToolCallQueue();
  private taskState: BackgroundTaskState = {};
  private chatKit: RunningTaskChatKit | undefined;
  private retryCount = 0;
  private toolRejectionCount = 0;
  private lastStepBudgetReminderStep: number | undefined;
  private disposed = false;

  readonly done: Promise<void>;

  constructor(
    private readonly options: Omit<
      CreateTaskExecutorOptions,
      "onTaskSettled"
    > & { taskId: string },
  ) {
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
    let unsubscribeBackgroundJobs: (() => void) | undefined;
    try {
      await this.options.adaptor.waitUntilReady?.();
      this.abortController.signal.throwIfAborted();
      this.taskState =
        (await this.options.readTaskState(this.options.taskId)) ?? {};
      this.abortController.signal.throwIfAborted();
      if (
        this.taskState.useCase !== undefined &&
        this.options.shouldRunForkTask?.(this.options.taskId) === false
      ) {
        this.options.store.commit(
          catalog.events.taskFailed({
            id: this.options.taskId,
            error: {
              kind: "AbortError",
              message: "Interrupted fork agent is not resumed.",
            },
            updatedAt: new Date(),
          }),
        );
        return;
      }
      this.chatKit = await this.createChatKit();
      this.abortController.signal.throwIfAborted();
      unsubscribeBackgroundJobs = this.chatKit.subscribeBackgroundJobs();

      while (!this.abortController.signal.aborted) {
        const stepResult = await this.step();
        this.abortController.signal.throwIfAborted();
        if (stepResult === "finished") {
          // Like the CLI, return an unanswered question without waiting or sending notices.
          if (isAwaitingFollowupAnswer(this.chat.messages.at(-1))) return;
          await this.options.waitForBackgroundJobs?.(
            this.options.taskId,
            this.abortController.signal,
          );
          this.abortController.signal.throwIfAborted();
          if (!this.chatKit.flushBackgroundJobNotifications()) return;
          await this.sendNextMessage();
          continue;
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

        await this.sendNextMessage();
      }
    } catch (error) {
      if (this.abortController.signal.aborted) {
        return;
      }
      const normalizedError = toError(error);
      if (this.chatKit) {
        await this.chatKit.markAsFailed(normalizedError);
      } else {
        this.options.store.commit(
          catalog.events.taskFailed({
            id: this.options.taskId,
            error: { kind: "InternalError", message: normalizedError.message },
            updatedAt: new Date(),
          }),
        );
      }
      throw normalizedError;
    } finally {
      await this.toolCallQueue.abort("user-abort");
      unsubscribeBackgroundJobs?.();
    }
  }

  private get task() {
    return (
      this.options.store.query(
        catalog.queries.makeTaskQuery(this.options.taskId),
      ) ?? undefined
    );
  }

  private get chat() {
    if (!this.chatKit) {
      throw new Error("Task chat is not initialized.");
    }
    return this.chatKit.chat;
  }

  private async createChatKit() {
    const context = {
      taskId: this.options.taskId,
      cwd: normalizeCwd(this.task?.cwd),
    };
    let getters = this.options.adaptor.getRequestGetters(context);

    const llmOverride = await this.options.adaptor.resolveTaskLLM?.({
      ...context,
      taskState: this.taskState,
    });
    if (llmOverride) {
      getters = { ...getters, getLLM: () => llmOverride };
    }

    const customAgent = getters
      .getCustomAgents?.()
      ?.find((agent) => agent.name === this.taskState.agentType);
    const environmentGetters = this.options.adaptor.getRequestGetters({
      ...context,
      omitCustomRules: customAgent?.omitAgentsMd === true,
    });
    getters = { ...getters, getEnvironment: environmentGetters.getEnvironment };

    // Subagent tasks store only the agent name; the tool whitelist is
    // resolved here so both the request-side tool selection and the
    // execution-side validation derive from the same agent definition.
    if (this.taskState.agentType && !this.taskState.tools) {
      if (!customAgent) {
        throw new Error(
          `Custom agent "${this.taskState.agentType}" not found for background subagent task.`,
        );
      }
      if (customAgent.tools) {
        this.taskState = { ...this.taskState, tools: customAgent.tools };
      }
    }

    this.abortController.signal.throwIfAborted();
    return this.options.createChatKit({
      taskId: this.options.taskId,
      store: this.options.store,
      blobStore: this.options.blobStore,
      abortSignal: this.abortController.signal,
      taskState: this.taskState,
      getters,
      appendMessage: (message) => this.chat.appendOrReplaceMessage(message),
    });
  }

  private async step(): Promise<"finished" | "next" | "retry"> {
    const lastMessage = this.chat.messages.at(-1);
    if (!lastMessage) {
      throw new Error("No messages in the task chat.");
    }

    const messageResult = await this.processMessage(lastMessage);
    if (messageResult) return messageResult;

    this.throwIfMaxStepExceeded();
    return this.processToolCalls(lastMessage);
  }

  private async processMessage(
    message: Message,
  ): Promise<"finished" | "retry" | undefined> {
    const task = this.task;
    if (!task) {
      throw new Error("Task is not loaded.");
    }

    // Use the same result-message check as the CLI for every background task.
    if (
      (task.status === "completed" || task.status === "pending-input") &&
      isResultMessage(message)
    ) {
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
          prompts.createSystemReminder(
            isAssistantMessageWithStreamingParts(message)
              ? prompts.incompleteResponseReminder
              : prompts.toolCallsReminder,
          ),
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

    const chatKit = this.chatKit;
    if (!chatKit) {
      throw new Error("Task chat is not initialized.");
    }

    chatKit.markStartToolsExecution();
    try {
      await this.toolCallQueue.start();
    } finally {
      chatKit.markEndToolsExecution();
    }
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
      const result = await this.options.adaptor.executeToolCall({
        taskId: this.options.taskId,
        parentTaskId: this.taskState.parentTaskId,
        storeId: this.options.store.storeId,
        toolName,
        toolCallId: toolCall.toolCallId,
        input: toolCall.input,
        abortSignal: this.abortController.signal,
        allowBackground: !isForkAgentUseCase(this.taskState.useCase),
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
    this.chatKit?.persistToolOutput();
  }

  private replaceLastMessageForRetry(message: Message): void {
    this.chat.appendOrReplaceMessage(message);
    if (isAssistantMessageWithStreamingParts(message)) {
      this.chat.appendOrReplaceMessage(
        createUserMessage(
          prompts.createSystemReminder(prompts.incompleteResponseReminder),
        ),
      );
    }
  }

  private async prepareRetryMessage(
    message: Message,
  ): Promise<Message | undefined> {
    const retryMessage = await prepareLastMessageForRetry(message, () =>
      this.options.clearFileStateCache?.(this.options.taskId),
    );
    return retryMessage ? (retryMessage as Message) : undefined;
  }

  /** Guards the step budget, warns the model when it is nearly out, then sends. */
  private async sendNextMessage() {
    this.throwIfMaxStepReached();
    this.maybeAppendStepBudgetReminder();
    await this.chat.sendMessage();
  }

  private throwIfMaxStepReached() {
    const { effectiveStepCount, maxSteps } = this.getStepLimitState();

    if (effectiveStepCount >= maxSteps) {
      this.throwMaxStepError(effectiveStepCount, maxSteps);
    }
  }

  private throwIfMaxStepExceeded() {
    const { effectiveStepCount, maxSteps } = this.getStepLimitState();

    if (effectiveStepCount > maxSteps) {
      this.throwMaxStepError(effectiveStepCount, maxSteps);
    }
  }

  /**
   * Reports the used/allowed steps so a step-limit death is distinguishable
   * from other failures in the reported error.
   */
  private throwMaxStepError(
    effectiveStepCount: number,
    maxSteps: number,
  ): never {
    throw new Error(
      `The task failed to complete, max step count reached (used ${effectiveStepCount} of ${maxSteps} steps).`,
    );
  }

  /**
   * Tells a step-bounded task how little budget is left, so it can batch its
   * remaining writes and still reach attemptCompletion. Only tasks with an
   * explicit budget (fork agents) are warned; the generic limits are high
   * enough that the warning would only be noise.
   */
  private maybeAppendStepBudgetReminder() {
    if (this.taskState.maxSteps === undefined) return;

    const { effectiveStepCount, maxSteps } = this.getStepLimitState();
    const remainingSteps = maxSteps - effectiveStepCount;
    if (remainingSteps > TaskExecutorStepBudgetReminderThreshold) return;
    // One reminder per step, otherwise retries would stack duplicates.
    if (this.lastStepBudgetReminderStep === effectiveStepCount) return;
    this.lastStepBudgetReminderStep = effectiveStepCount;

    const reminder = prompts.createSystemReminder(
      prompts.stepBudgetReminder({ remainingSteps, maxSteps }),
    );
    const lastMessage = this.chat.messages.at(-1);
    if (lastMessage?.role === "user") {
      // Fold into the pending reminder turn (e.g. the tool-calls reminder)
      // rather than emitting two consecutive user messages.
      this.chat.appendOrReplaceMessage({
        ...lastMessage,
        parts: [...lastMessage.parts, { type: "text", text: reminder }],
      } as Message);
      return;
    }
    this.chat.appendOrReplaceMessage(createUserMessage(reminder));
  }

  private getStepLimitState() {
    const stepCount = countStepStarts(this.chat.messages);
    const effectiveStepCount = Math.max(
      0,
      stepCount - (this.taskState.baselineStepCount ?? 0),
    );
    const maxSteps =
      this.taskState.maxSteps ??
      (this.taskState.useCase === undefined
        ? TaskExecutorSubagentMaxStep
        : TaskExecutorMaxStep);

    return { effectiveStepCount, maxSteps };
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
