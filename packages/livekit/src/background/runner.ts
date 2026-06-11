import {
  type BackgroundTaskState,
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
  isUserInputToolName,
  isUserInputToolPart,
  validateToolPolicy,
} from "@getpochi/tools";
import {
  type ToolUIPart,
  getStaticToolName,
  isStaticToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import type { BlobStore } from "../blob-store";
import type { PrepareRequestGetters } from "../chat/flexible-chat-transport";
import { LiveChatKit } from "../chat/live-chat-kit";
import { defaultCatalog as catalog } from "../livestore";
import { makeTaskQuery } from "../livestore/default-queries";
import type { LiveKitStore, Message, Task } from "../types";
import { HeadlessChat } from "./headless-chat";

const logger = getLogger("BackgroundTaskRunner");

const BackgroundTaskMaxStep = 50;
const BackgroundTaskMaxRetry = 8;
const BackgroundTaskMaxToolRejections = 5;

export interface BackgroundTaskRuntimeContext {
  taskId: string;
  cwd: string | undefined;
}

export type BackgroundTaskRequestGetters = PrepareRequestGetters;

export interface BackgroundTaskToolCallExecution {
  taskId: string;
  parentTaskId: string | undefined;
  storeId: string;
  toolName: string;
  toolCallId: string;
  input: unknown;
  abortSignal: AbortSignal;
  toolPolicies: CompiledToolPolicies | undefined;
}

export interface BackgroundTaskRuntimeAdapter {
  getRequestGetters(
    context: BackgroundTaskRuntimeContext,
  ): BackgroundTaskRequestGetters;
  readBackgroundTaskState(
    taskId: string,
  ): Promise<BackgroundTaskState | undefined> | BackgroundTaskState | undefined;
  executeToolCall(args: BackgroundTaskToolCallExecution): Promise<unknown>;
  copyFileStateCache?(
    sourceTaskId: string,
    targetTaskId: string,
  ): void | Promise<void>;
  clearFileStateCache?(taskId: string): void | Promise<void>;
  onBackgroundTaskError?(taskId: string, error: Error): void | Promise<void>;
}

type BackgroundTaskToolOutput = {
  tool: string;
  toolCallId: string;
  output: unknown;
};

type CreateBackgroundTaskRunnerOptions = {
  store: LiveKitStore;
  blobStore: BlobStore;
  adapter: BackgroundTaskRuntimeAdapter;
};

export function createBackgroundTaskRunner(
  options: CreateBackgroundTaskRunnerOptions,
) {
  return new BackgroundTaskRunner(options);
}

export class BackgroundTaskRunner {
  private readonly store: LiveKitStore;
  private readonly blobStore: BlobStore;
  private readonly runtime: BackgroundTaskRuntimeAdapter;
  private readonly workers = new Map<string, BackgroundTaskWorker>();
  private unsubscribe: (() => void) | undefined;
  private started = false;

  constructor({
    store,
    blobStore,
    adapter,
  }: CreateBackgroundTaskRunnerOptions) {
    this.store = store;
    this.blobStore = blobStore;
    this.runtime = adapter;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.unsubscribe = this.store.subscribe(
      catalog.queries.runnableTasks$,
      () => this.reconcile(this.getRunnableTasks()),
    );
    this.reconcile(this.getRunnableTasks());
  }

  async stop() {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.started = false;
    await Promise.all(
      [...this.workers.values()].map((worker) => worker.stop("user-abort")),
    );
    this.workers.clear();
  }

  async drain() {
    this.start();

    while (true) {
      const runnableTasks = this.getRunnableTasks();
      this.reconcile(runnableTasks);

      if (runnableTasks.length === 0 && this.workers.size === 0) {
        return;
      }

      const activeWorkers = [...this.workers.values()];
      await Promise.race([
        ...activeWorkers.map((worker) => worker.done.catch(() => undefined)),
        sleep(100),
      ]);
    }
  }

  private reconcile(tasks: readonly Task[]) {
    for (const task of tasks) {
      if (!this.workers.has(task.id)) {
        this.startWorker(task.id);
      }
    }
  }

  private getRunnableTasks() {
    return this.store
      .query(catalog.queries.runnableTasks$)
      .filter((task) => this.isTaskRunnable(task));
  }

  private isTaskRunnable(task: Task) {
    if (task.status === "pending-model" || task.status === "pending-tool") {
      return true;
    }

    if (task.status !== "completed") {
      return false;
    }

    return hasPendingNonCompletionToolCalls(this.readMessages(task.id).at(-1));
  }

  private readMessages(taskId: string) {
    return this.store
      .query(catalog.queries.makeMessagesQuery(taskId))
      .map((message) => message.data as Message);
  }

  private startWorker(taskId: string) {
    const worker = new BackgroundTaskWorker({
      taskId,
      store: this.store,
      blobStore: this.blobStore,
      runtime: this.runtime,
    });
    this.workers.set(taskId, worker);

    worker.done
      .catch(async (error) => {
        const normalizedError = toError(error);
        logger.warn(
          { taskId, error: normalizedError },
          "Background task failed",
        );
        await this.runtime.onBackgroundTaskError?.(taskId, normalizedError);
      })
      .finally(() => {
        if (this.workers.get(taskId) === worker) {
          this.workers.delete(taskId);
        }
      });
  }
}

type BackgroundTaskWorkerOptions = {
  taskId: string;
  store: LiveKitStore;
  blobStore: BlobStore;
  runtime: BackgroundTaskRuntimeAdapter;
};

class BackgroundTaskWorker {
  private readonly taskId: string;
  private readonly store: LiveKitStore;
  private readonly blobStore: BlobStore;
  private readonly runtime: BackgroundTaskRuntimeAdapter;
  private readonly abortController = new AbortController();
  private readonly toolCallQueue = new ToolCallQueue();
  private backgroundTaskState: BackgroundTaskState = {};
  private chatKit: LiveChatKit<HeadlessChat> | undefined;
  private retryCount = 0;
  private toolRejectionCount = 0;
  private stopped = false;

  readonly done: Promise<void>;

  constructor(options: BackgroundTaskWorkerOptions) {
    this.taskId = options.taskId;
    this.store = options.store;
    this.blobStore = options.blobStore;
    this.runtime = options.runtime;
    this.done = this.run();
  }

  async stop(reason: string) {
    if (this.stopped) return;
    this.stopped = true;
    this.abortController.abort(reason);
    await this.toolCallQueue.abort("user-abort");
    await this.chatKit?.chat.stop();
  }

  private async run() {
    try {
      this.backgroundTaskState =
        (await this.runtime.readBackgroundTaskState(this.taskId)) ?? {};
      if (
        this.backgroundTaskState.parentTaskId &&
        this.runtime.copyFileStateCache
      ) {
        await this.runtime.copyFileStateCache(
          this.backgroundTaskState.parentTaskId,
          this.taskId,
        );
      }

      this.chatKit = this.createChatKit(this.task);

      while (!this.abortController.signal.aborted) {
        const stepResult = await this.step();
        if (stepResult === "finished") {
          return;
        }

        if (stepResult === "retry") {
          this.retryCount += 1;
          if (this.retryCount > BackgroundTaskMaxRetry) {
            throw new Error(
              "The background task failed to complete, max retry count reached.",
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
    return this.store.query(makeTaskQuery(this.taskId)) ?? undefined;
  }

  private get chat() {
    if (!this.chatKit) {
      throw new Error("Background task chat is not initialized.");
    }
    return this.chatKit.chat;
  }

  private createChatKit(currentTask: Task | undefined) {
    return new LiveChatKit<HeadlessChat>({
      taskId: this.taskId,
      store: this.store,
      blobStore: this.blobStore,
      chatClass: HeadlessChat,
      abortSignal: this.abortController.signal,
      isSubTask: false,
      requestUseCase: this.backgroundTaskState.useCase,
      disableAutoCompact: true,
      getters: this.runtime.getRequestGetters(
        this.createRuntimeContext(currentTask),
      ),
    });
  }

  private createRuntimeContext(
    currentTask: Task | undefined,
  ): BackgroundTaskRuntimeContext {
    return {
      taskId: this.taskId,
      cwd: normalizeCwd(this.task?.cwd) ?? normalizeCwd(currentTask?.cwd),
    };
  }

  private async step(): Promise<"finished" | "next" | "retry"> {
    this.throwIfMaxStepReached();

    const lastMessage = this.chat.messages.at(-1);
    if (!lastMessage) {
      throw new Error("No messages in the background task chat.");
    }

    return (
      this.processMessage(lastMessage) ?? this.processToolCalls(lastMessage)
    );
  }

  private processMessage(message: Message): "finished" | "retry" | undefined {
    const task = this.task;
    if (!task) {
      throw new Error("Background task is not loaded.");
    }

    if (task.status === "completed" || task.status === "pending-input") {
      if (
        task.status === "completed" &&
        hasPendingNonCompletionToolCalls(message)
      ) {
        return undefined;
      }
      return "finished";
    }

    if (task.status === "failed") {
      if (isAbortTaskError(task.error)) {
        throw toError(task.error);
      }
      const processed = prepareLastMessageForRetry(message);
      if (processed) {
        this.replaceLastMessageForRetry(processed as Message);
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
      const processed = prepareLastMessageForRetry(message);
      if (processed) {
        this.replaceLastMessageForRetry(processed as Message);
      }
      return "retry";
    }

    if (isAssistantMessageWithNoToolCalls(message)) {
      this.chat.appendOrReplaceMessage(
        createUserMessage(
          prompts.createSystemReminder(
            "You should use tool calls to answer the question, for example, use attemptCompletion if the job is done, or use askFollowupQuestion to clarify the request.",
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

    await this.toolCallQueue.start();
    return this.task?.status === "completed" ? "finished" : "next";
  }

  private async runToolCall(
    toolCall: ToolUIPart,
  ): Promise<BatchedToolCallResult> {
    const toolName = getStaticToolName(toolCall);
    const toolPolicies = this.backgroundTaskState.tools
      ? compileToolPolicies([...this.backgroundTaskState.tools])
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
          "The background task kept calling disallowed tools",
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
      const result = await this.runtime.executeToolCall({
        taskId: this.taskId,
        parentTaskId: this.backgroundTaskState.parentTaskId,
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
    const allowedToolsSet = this.backgroundTaskState.tools
      ? getAllowedToolNames([...this.backgroundTaskState.tools])
      : undefined;

    if (allowedToolsSet && !allowedToolsSet.has(toolName)) {
      this.toolRejectionCount += 1;
      if (this.toolRejectionCount >= BackgroundTaskMaxToolRejections) {
        throw new Error(
          `The background task kept calling disallowed tools (${this.toolRejectionCount}). Stopping.`,
        );
      }
      throw new Error(
        `Tool ${toolName} is not allowed for this background task.`,
      );
    }

    validateToolPolicy(toolName, input, toolPolicies, {
      cwd: normalizeCwd(this.task?.cwd) ?? "",
    });
  }

  private async addToolOutput(output: BackgroundTaskToolOutput) {
    await this.chat.addToolOutput(output as never);
    await this.persistLastMessage();
  }

  private async persistLastMessage() {
    const lastMessage = this.chat.messages.at(-1);
    if (!lastMessage) return;
    this.store.commit(
      catalog.events.updateMessages({ messages: [lastMessage] }),
    );
  }

  private replaceLastMessageForRetry(message: Message): void {
    void this.runtime.clearFileStateCache?.(this.taskId);
    this.chat.appendOrReplaceMessage(message);
  }

  private throwIfMaxStepReached() {
    const stepCount = countStepStarts(this.chat.messages);
    const effectiveStepCount = Math.max(
      0,
      stepCount - (this.backgroundTaskState.baselineStepCount ?? 0),
    );

    if (effectiveStepCount > BackgroundTaskMaxStep) {
      throw new Error(
        "The background task failed to complete, max step count reached.",
      );
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

function hasPendingNonCompletionToolCalls(message: Message | undefined) {
  if (!message || message.role !== "assistant") return false;

  return message.parts.some(
    (part) =>
      isStaticToolUIPart(part) &&
      part.state === "input-available" &&
      !isUserInputToolName(getStaticToolName(part)),
  );
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

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error(JSON.stringify(error));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
