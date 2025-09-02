import { getLogger, prompts } from "@getpochi/common";
import {
  isAssistantMessageWithEmptyParts,
  isAssistantMessageWithNoToolCalls,
  isAssistantMessageWithOutputError,
  isAssistantMessageWithPartialToolCalls,
  prepareLastMessageForRetry,
} from "@getpochi/common/message-utils";
import { findTodos, mergeTodos } from "@getpochi/common/message-utils";
import type { PochiApiClient } from "@getpochi/common/pochi-api";
import type { LLMRequestData, Message } from "@getpochi/livekit";
import { LiveChatKit } from "@getpochi/livekit/node";
import { type Todo, isUserInputToolPart } from "@getpochi/tools";
import type { Store } from "@livestore/livestore";
import {
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { readEnvironment } from "./lib/read-environment";
import { StepCount } from "./lib/step-count";
import { Chat } from "./livekit";
import { executeToolCall } from "./tools";
import type { ToolCallOptions } from "./types";

export interface RunnerOptions {
  /**
   * The uid of the task to run.
   */
  uid: string;

  llm: LLMRequestData;

  apiClient: PochiApiClient;

  store: Store;

  // The prompt to use for creating the task
  prompt: string;

  /**
   * The current working directory for the task runner.
   * This is used to determine where to read/write files and execute commands.
   * It should be an absolute path.
   */
  cwd: string;

  /**
   * The path to the ripgrep executable.
   * This is used for searching files in the task runner.
   */
  rg: string;

  /**
   * Force stop the runner after max rounds reached.
   * If a task cannot be completed in max rounds, it is likely stuck in an infinite loop.
   */
  maxSteps: number;

  /**
   * Force stop the runner after max retries reached in a single round.
   */
  maxRetries: number;

  /**
   * Whether this is a sub-task. Sub-tasks don't apply certain middlewares
   * like the newTask middleware to prevent infinite recursion.
   */
  isSubTask?: boolean;

  waitUntil?: (promise: Promise<unknown>) => void;
}

const logger = getLogger("TaskRunner");

export class TaskRunner {
  private toolCallOptions: ToolCallOptions;
  private stepCount: StepCount;

  private todos: Todo[] = [];
  private chatKit: LiveChatKit<Chat>;

  private get chat() {
    return this.chatKit.chat;
  }

  get state() {
    return this.chatKit.chat.getState();
  }

  constructor(options: RunnerOptions) {
    this.toolCallOptions = {
      cwd: options.cwd,
      rg: options.rg,
      createSubTaskRunner: () => ({
        llm: options.llm,
        apiClient: options.apiClient,
        store: options.store,
        waitUntil: options.waitUntil || (() => {}),
      }),
    };
    this.stepCount = new StepCount(options.maxSteps, options.maxRetries);
    this.chatKit = new LiveChatKit<Chat>({
      taskId: options.uid,
      apiClient: options.apiClient,
      store: options.store,
      chatClass: Chat,
      waitUntil: options.waitUntil,
      isCli: true,
      isSubTask: options.isSubTask,
      getters: {
        getLLM: () => options.llm,
        getEnvironment: async () => ({
          ...(await readEnvironment({ cwd: options.cwd })),
          todos: this.todos,
        }),
      },
    });
    if (options.prompt) {
      if (this.chatKit.inited) {
        this.chatKit.chat.appendOrReplaceMessage({
          id: crypto.randomUUID(),
          role: "user",
          parts: [{ type: "text", text: options.prompt }],
        });
      } else {
        this.chatKit.init(options.prompt);
      }
    }
  }

  get shareId() {
    return this.chatKit.task?.shareId;
  }

  async run(): Promise<void> {
    logger.debug("Starting TaskRunner...");

    try {
      logger.trace("Start step loop.");
      this.stepCount.reset();
      while (true) {
        const stepResult = await this.step();
        if (stepResult === "finished") {
          break;
        }
        if (stepResult === "retry") {
          this.stepCount.nextRetry();
        } else {
          this.stepCount.nextStep();
        }
      }
    } catch (e) {
      const error = toError(e);
      logger.trace("Failed:", error);
    }
  }

  /**
   * @returns
   *  - "finished" if the task is finished and no more steps are needed.
   *  - "next" if the task is not finished and needs next round.
   *  - "retry" if the task is not finished and needs to retry the current round.
   * @throws {Error} - Throws an error if this step is failed.
   */
  private async step(): Promise<"finished" | "next" | "retry"> {
    this.todos = this.loadTodos();
    const lastMessage = this.chat.messages.at(-1);
    if (!lastMessage) {
      throw new Error("No messages in the chat.");
    }

    const result = await this.process(lastMessage);
    if (result === "finished") {
      return "finished";
    }
    if (result === "next") {
      this.stepCount.throwIfReachedMaxSteps();
    }
    if (result === "retry") {
      this.stepCount.throwIfReachedMaxRetries();
    }

    await this.chatKit.chat.sendMessage();
    return result;
  }

  private loadTodos() {
    let todos: Todo[] = [];
    for (const x of this.chat.messages) {
      todos = mergeTodos(this.todos, findTodos(x) ?? []);
    }
    return todos;
  }

  private async process(
    message: Message,
  ): Promise<"finished" | "next" | "retry"> {
    return (
      this.processMessage(message) || (await this.processToolCalls(message))
    );
  }

  private processMessage(message: Message) {
    const { task } = this.chatKit;
    if (!task) {
      throw new Error("Task is not loaded");
    }

    if (
      (task.status === "completed" || task.status === "pending-input") &&
      isResultMessage(message)
    ) {
      logger.trace(
        "Task is completed or pending input, no more steps to process.",
      );
      return "finished";
    }

    if (task.status === "failed") {
      if (task.error?.kind === "APICallError" && !task.error.isRetryable) {
        return "finished";
      }
      logger.error(
        "Task is failed, trying to resend last message to resume it.",
        task.error,
      );
      return "retry";
    }

    if (message.role !== "assistant") {
      logger.trace(
        "Last message is not a assistant message, resending it to resume the task.",
      );
      return "retry";
    }

    if (
      isAssistantMessageWithEmptyParts(message) ||
      isAssistantMessageWithPartialToolCalls(message) ||
      isAssistantMessageWithOutputError(message) ||
      lastAssistantMessageIsCompleteWithToolCalls({
        messages: this.chat.messages,
      })
    ) {
      logger.trace(
        "Last message is assistant with empty parts or partial/completed tool calls, resending it to resume the task.",
      );
      const processed = prepareLastMessageForRetry(message);
      if (processed) {
        this.chat.appendOrReplaceMessage(processed);
      } else {
        // skip, the last message is ready to be resent
      }
      return "retry";
    }

    if (isAssistantMessageWithNoToolCalls(message)) {
      logger.trace(
        "Last message is assistant with no tool calls, sending a new user reminder.",
      );
      const message = createUserMessage(
        prompts.createSystemReminder(
          "You should use tool calls to answer the question, for example, use attemptCompletion if the job is done, or use askFollowupQuestions to clarify the request.",
        ),
      );
      this.chat.appendOrReplaceMessage(message);
      return "next";
    }
  }

  private async processToolCalls(message: Message) {
    logger.trace("Processing tool calls in the last message.");
    for (const toolCall of message.parts.filter(isToolUIPart)) {
      if (toolCall.state !== "input-available") continue;
      const toolName = getToolName(toolCall);
      logger.trace(
        `Found tool call: ${toolName} with args: ${JSON.stringify(
          toolCall.input,
        )}`,
      );

      const toolResult = await executeToolCall(toolCall, this.toolCallOptions);

      this.chatKit.chat.addToolResult({
        // @ts-expect-error
        tool: toolName,
        toolCallId: toolCall.toolCallId,
        // @ts-expect-error
        output: toolResult,
      });

      logger.trace(`Tool call result: ${JSON.stringify(toolResult)}`);
    }
    logger.trace("All tool calls processed in the last message.");

    return "next" as const;
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
  };
}

function isResultMessage(message: Message): boolean {
  return (
    message.role === "assistant" &&
    (message.parts?.some(isUserInputToolPart) ?? false)
  );
}

// Utility functions moved from ./lib/error-utils.ts
function toError(e: unknown): Error {
  if (e instanceof Error) {
    return e;
  }
  if (typeof e === "string") {
    return new Error(e);
  }
  return new Error(JSON.stringify(e));
}
