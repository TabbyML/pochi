import { getLogger, prompts } from "@getpochi/common";
import type { McpHub } from "@getpochi/common/mcp-utils";
import {
  isAssistantMessageWithEmptyParts,
  isAssistantMessageWithNoToolCalls,
  isAssistantMessageWithOutputError,
  isAssistantMessageWithPartialToolCalls,
  prepareLastMessageForRetry,
} from "@getpochi/common/message-utils";
import { findTodos, mergeTodos } from "@getpochi/common/message-utils";

import {
  type LLMRequestData,
  type Message,
  processContentOutput,
} from "@getpochi/livekit";
import { LiveChatKit } from "@getpochi/livekit/node";
import { type Todo, isUserInputToolPart } from "@getpochi/tools";
import type { CustomAgent } from "@getpochi/tools";
import type { Store } from "@livestore/livestore";
import {
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import type z from "zod/v4";
import { readEnvironment } from "./lib/read-environment";
import { StepCount } from "./lib/step-count";
import { Chat } from "./livekit";
import { createOnOverrideMessages } from "./on-override-messages";
import { executeToolCall } from "./tools";
import type { ToolCallOptions } from "./types";

export interface RunnerOptions {
  /**
   * The uid of the task to run.
   */
  uid: string;

  llm: LLMRequestData;

  store: Store;

  // The parts to use for creating the task
  parts?: Message["parts"];

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

  /**
   * Custom agent to use for this task
   */
  customAgent?: CustomAgent;

  /**
   * Available custom agents for the new task tool
   */
  customAgents?: CustomAgent[];

  onSubTaskCreated?: (runner: TaskRunner) => void;

  /**
   * MCP Hub instance for accessing MCP server tools
   */
  mcpHub?: McpHub;

  outputSchema?: z.ZodAny;
}

const logger = getLogger("TaskRunner");

export class TaskRunner {
  private store: Store;
  private cwd: string;
  private llm: LLMRequestData;
  private toolCallOptions: ToolCallOptions;
  private stepCount: StepCount;

  private todos: Todo[] = [];
  private chatKit: LiveChatKit<Chat>;

  readonly taskId: string;

  private get chat() {
    return this.chatKit.chat;
  }

  get state() {
    return this.chatKit.chat.getState();
  }

  constructor(options: RunnerOptions) {
    this.cwd = options.cwd;
    this.llm = options.llm;
    this.toolCallOptions = {
      rg: options.rg,
      customAgents: options.customAgents,
      mcpHub: options.mcpHub,
      createSubTaskRunner: (taskId: string, customAgent?: CustomAgent) => {
        // create sub task
        const runner = new TaskRunner({
          ...options,
          parts: undefined, // should not use parts from parent
          uid: taskId,
          isSubTask: true,
          customAgent,
        });

        options.onSubTaskCreated?.(runner);
        return runner;
      },
    };
    this.stepCount = new StepCount(options.maxSteps, options.maxRetries);
    this.store = options.store;
    this.chatKit = new LiveChatKit<Chat>({
      taskId: options.uid,
      store: options.store,
      chatClass: Chat,
      isCli: true,
      isSubTask: options.isSubTask,
      customAgent: options.customAgent,
      outputSchema: options.outputSchema,
      onOverrideMessages: createOnOverrideMessages(this.cwd),
      getters: {
        getLLM: () => options.llm,
        getEnvironment: async () => ({
          ...(await readEnvironment({ cwd: options.cwd })),
          todos: this.todos,
        }),
        getCustomAgents: () => this.toolCallOptions.customAgents || [],
        ...(options.mcpHub
          ? {
              getMcpInfo: () => {
                const status = options.mcpHub?.status.value;
                return {
                  toolset: status?.toolset || {},
                  instructions: status?.instructions || "",
                };
              },
            }
          : {}),
      },
    });
    if (options.parts && options.parts.length > 0) {
      if (this.chatKit.inited) {
        this.chatKit.chat.appendOrReplaceMessage({
          id: crypto.randomUUID(),
          role: "user",
          parts: options.parts,
        });
      } else {
        this.chatKit.init(options.cwd, options.parts);
      }
    }

    this.taskId = options.uid;
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
          await this.stepCount.nextRetry();
        } else {
          this.stepCount.nextStep();
        }
      }
    } catch (e) {
      const error = toError(e);
      logger.trace("Failed:", error);
      this.chatKit.markAsFailed(error);
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
      return "retry";
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

      const toolResult = await processContentOutput(
        this.store,
        await executeToolCall(
          toolCall,
          this.toolCallOptions,
          this.cwd,
          undefined,
          this.llm.contentType,
        ),
      );

      await this.chatKit.chat.addToolResult({
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
