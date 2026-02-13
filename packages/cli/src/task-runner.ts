import { getLogger, prompts } from "@getpochi/common";
import type { BrowserSessionStore } from "@getpochi/common/browser";
import type { McpHub } from "@getpochi/common/mcp-utils";
import {
  isAssistantMessageWithEmptyParts,
  isAssistantMessageWithNoToolCalls,
  isAssistantMessageWithPartialToolCalls,
  prepareLastMessageForRetry,
} from "@getpochi/common/message-utils";
import { findTodos, mergeTodos } from "@getpochi/common/message-utils";

import { spawn } from "node:child_process";
import type { UITools } from "@getpochi/livekit";
import {
  type BlobStore,
  type LLMRequestData,
  type LiveKitStore,
  type Message,
  processContentOutput,
} from "@getpochi/livekit";
import { LiveChatKit } from "@getpochi/livekit/node";
import { type Todo, isUserInputToolPart } from "@getpochi/tools";
import type { CustomAgent, Skill } from "@getpochi/tools";
import {
  type ToolUIPart,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import ora from "ora";

import { resolveToolCallArgs } from "@getpochi/common/tool-utils";
import type z from "zod/v4";
import type { FileSystem } from "./lib/file-system";
import { readEnvironment } from "./lib/read-environment";

import { StepCount } from "./lib/step-count";

import { AsyncSubTaskManager } from "./lib/async-subtask-manager";
import { BackgroundJobManager } from "./lib/background-job-manager";
import { Chat } from "./livekit";

import { decodeStoreId } from "@getpochi/common/store-id-utils";
import { executeToolCall } from "./tools";
import type { ToolCallOptions } from "./types";

export interface RunnerOptions {
  /**
   * The uid of the task to run.
   */
  uid: string;

  llm: LLMRequestData;

  store: LiveKitStore;

  blobStore: BlobStore;

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

  /**
   * Available skills for skill tool
   */
  skills?: Skill[];

  onSubTaskCreated?: (runner: TaskRunner) => void;

  /**
   * MCP Hub instance for accessing MCP server tools
   */
  mcpHub?: McpHub;

  /**
   * AbortSignal for cancelling the task execution
   */
  abortSignal?: AbortSignal;

  outputSchema?: z.ZodAny;

  attemptCompletionSchema?: z.ZodAny;

  attemptCompletionHook?: string;

  /**
   * The file system to use for the task runner.
   */
  filesystem: FileSystem;

  browserSessionStore?: BrowserSessionStore;

  /**
   * Timeout in milliseconds to wait for async subtasks and background jobs
   * to complete before finalizing attemptCompletion. Default: 60000ms (60s).
   * Set to 0 to disable waiting.
   */
  asyncWaitTimeoutInMs?: number;
}

const logger = getLogger("TaskRunner");

export class TaskRunner {
  private store: LiveKitStore;
  private blobStore: BlobStore;
  private cwd: string;
  private llm: LLMRequestData;
  private toolCallOptions: ToolCallOptions;
  private stepCount: StepCount;

  private todos: Todo[] = [];
  private chatKit: LiveChatKit<Chat>;
  private backgroundJobManager: BackgroundJobManager;
  private asyncSubTaskManager: AsyncSubTaskManager;
  private fileSystem: FileSystem;
  private customAgent?: CustomAgent;

  private attemptCompletionHook?: string;
  private asyncWaitTimeoutInMs: number;
  private abortSignal?: AbortSignal;

  readonly taskId: string;

  readonly attemptCompletionSchemaOverride: boolean;

  private get chat() {
    return this.chatKit.chat;
  }

  get state() {
    return this.chatKit.chat.getState();
  }

  constructor(options: RunnerOptions) {
    this.cwd = options.cwd;
    this.llm = options.llm;
    this.blobStore = options.blobStore;
    this.backgroundJobManager = new BackgroundJobManager();
    this.asyncSubTaskManager = new AsyncSubTaskManager(options.store);
    this.customAgent = options.customAgent;

    this.fileSystem = options.filesystem;

    this.toolCallOptions = {
      rg: options.rg,
      fileSystem: this.fileSystem,

      customAgents: options.customAgents,
      skills: options.skills,
      mcpHub: options.mcpHub,
      backgroundJobManager: this.backgroundJobManager,
      asyncSubTaskManager: this.asyncSubTaskManager,
      browserSessionStore: options.browserSessionStore,
      createSubTaskRunner: (
        taskId: string,
        runAsync: boolean,
        customAgent?: CustomAgent,
      ) => {
        // create sub task
        if (runAsync) {
          this.asyncSubTaskManager.registerTask(taskId);
        }

        const runner = new TaskRunner({
          ...options,
          parts: undefined, // should not use parts from parent
          uid: taskId,
          isSubTask: true,
          customAgent,
        });
        this.attemptCompletionHook = options.attemptCompletionHook;

        if (!runAsync) {
          options.onSubTaskCreated?.(runner);
        }
        return runner;
      },
    };
    this.stepCount = new StepCount(options.maxSteps, options.maxRetries);
    this.chatKit = new LiveChatKit<Chat>({
      taskId: options.uid,
      store: options.store,
      blobStore: this.blobStore,
      chatClass: Chat,
      isSubTask: options.isSubTask,
      customAgent: options.customAgent,

      outputSchema: options.outputSchema,
      attemptCompletionSchema: options.attemptCompletionSchema,

      abortSignal: options.abortSignal,

      getters: {
        getLLM: () => options.llm,
        getEnvironment: async () => ({
          ...(await readEnvironment({ cwd: options.cwd })),
          todos: this.todos,
        }),
        getCustomAgents: () => this.toolCallOptions.customAgents || [],
        getSkills: () => this.toolCallOptions.skills || [],
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
        this.chatKit.init(options.cwd, { parts: options.parts });
      }
    }

    this.store = options.store;
    this.taskId = options.uid;
    this.attemptCompletionHook = options.attemptCompletionHook;
    this.attemptCompletionSchemaOverride = !!options.attemptCompletionSchema;
    this.asyncWaitTimeoutInMs = options.asyncWaitTimeoutInMs ?? 60000;
    this.abortSignal = options.abortSignal;
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
    } finally {
      this.backgroundJobManager.killAll();
      if (this.customAgent?.name === "browser") {
        this.toolCallOptions.browserSessionStore?.unregisterBrowserSession(
          this.taskId,
        );
      }
    }
  }

  /**
   * Wait for all async subtasks and background jobs to complete.
   * Respects the configured asyncWaitTimeoutInMs and abort signal.
   * @returns A formatted string with async results if any, or undefined if no results
   */
  private async waitForAsyncWork(): Promise<string | undefined> {
    const pendingSubtaskIds = this.asyncSubTaskManager.getPendingTaskIds();
    const pendingJobIds = this.backgroundJobManager.getPendingJobIds();

    const spinner = ora(
      `Waiting for async work to complete (timeout: ${this.asyncWaitTimeoutInMs}ms)...`,
    ).start();

    // Wait for both subtasks and background jobs in parallel
    const [subtaskStatus, jobStatus] = await Promise.all([
      this.asyncSubTaskManager.waitForAllTasks(
        this.asyncWaitTimeoutInMs,
        this.abortSignal,
      ),
      this.backgroundJobManager.waitForAllJobs(
        this.asyncWaitTimeoutInMs,
        this.abortSignal,
      ),
    ]);

    // Handle timeout or abort - return undefined to finish without feeding back to LLM
    if (subtaskStatus === "timeout" || jobStatus === "timeout") {
      const remainingSubtasks = this.asyncSubTaskManager.getPendingTaskIds();
      const remainingJobs = this.backgroundJobManager.getPendingJobIds();
      spinner.fail(
        `Async wait timeout reached. Remaining: ${remainingSubtasks.length} subtask(s), ${remainingJobs.length} job(s)`,
      );
      return undefined;
    }

    if (subtaskStatus === "aborted" || jobStatus === "aborted") {
      spinner.fail("Async work wait was aborted.");
      return undefined;
    }

    spinner.succeed("All async work completed.");

    // Collect results from completed async work
    const results: string[] = [];

    for (const taskId of pendingSubtaskIds) {
      const taskOutput = this.asyncSubTaskManager.readTaskOutput(taskId);
      if (taskOutput) {
        const parts = [
          `Async Subtask (ID: ${taskId}, status: ${taskOutput.status}):`,
        ];
        if (taskOutput.error) parts.push(`Error: ${taskOutput.error}`);
        if (taskOutput.output) parts.push(`Output:\n${taskOutput.output}`);
        results.push(parts.join("\n"));
      }
    }

    for (const jobId of pendingJobIds) {
      const jobOutput = this.backgroundJobManager.readOutput(jobId);
      if (jobOutput) {
        const parts = [
          `Background Job (ID: ${jobId}, status: ${jobOutput.status}):`,
        ];
        if (jobOutput.output) parts.push(`Output:\n${jobOutput.output}`);
        results.push(parts.join("\n"));
      }
    }

    return results.length > 0 ? results.join("\n\n") : undefined;
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
      // Check for pending async subtasks and background jobs
      const hasPendingSubtasks = this.asyncSubTaskManager.hasPendingTasks();
      const hasPendingJobs = this.backgroundJobManager.hasPendingJobs();

      if (
        this.asyncWaitTimeoutInMs > 0 &&
        (hasPendingSubtasks || hasPendingJobs)
      ) {
        const asyncResults = await this.waitForAsyncWork();
        if (asyncResults) {
          // If there are async results - feed them back to LLM instead of completing
          const userMessage = createAsyncResultsMessage(asyncResults);
          this.chat.appendOrReplaceMessage(userMessage);
          return "next";
        }
      }

      if (this.attemptCompletionHook && isResultMessage(lastMessage)) {
        const attemptCompletionPart = lastMessage.parts?.find(
          (p) => isToolUIPart(p) && getToolName(p) === "attemptCompletion",
        );

        if (attemptCompletionPart) {
          logger.debug(
            `Executing verification command: ${this.attemptCompletionHook}`,
          );
          try {
            await this.runAttemptCompletionHook(
              this.attemptCompletionHook,
              (attemptCompletionPart as unknown as { input: unknown }).input,
            );
          } catch (e) {
            const error = e as {
              message: string;
              stdout: string;
              stderr: string;
            };
            logger.error(`Verification command failed: ${error.message}`);
            const errorMsg = `Verification failed:\n${error.message}\n\nStdout:\n${error.stdout}\n\nStderr:\n${error.stderr}`;
            const message = createUserMessage(errorMsg);
            this.chat.appendOrReplaceMessage(message);
            return "next";
          }
        }
      }
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
      // Do not retry on abort — exit gracefully on first Ctrl+C
      if (task.error?.kind === "AbortError") {
        return "finished";
      }
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
          "You should use tool calls to answer the question, for example, use attemptCompletion if the job is done, or use askFollowupQuestion to clarify the request.",
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

      const { taskId } = decodeStoreId(this.store.storeId);
      const resolvedInput = resolveToolCallArgs(toolCall.input, taskId);

      let envs: Record<string, string> | undefined;
      if (this.customAgent?.name === "browser") {
        envs = this.toolCallOptions.browserSessionStore?.getAgentBrowserEnvs(
          this.taskId,
        );
      }

      const toolResult = await processContentOutput(
        this.blobStore,
        await executeToolCall(
          { ...toolCall, input: resolvedInput } as ToolUIPart<UITools>,
          this.toolCallOptions,
          this.cwd,
          undefined,
          this.llm.contentType,
          envs,
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

  // Helper method to run the command
  private runAttemptCompletionHook(
    command: string,
    input: unknown,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, {
        cwd: this.cwd,
        stdio: ["pipe", "pipe", "pipe"], // Pipe stdin, stdout, stderr
        shell: true, // Use shell to support complex commands
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });

      child.on("error", (err) => {
        reject({ message: err.message, stdout, stderr });
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject({
            message: `Command exited with code ${code}`,
            stdout,
            stderr,
          });
        }
      });

      // Write the JSON input to stdin
      const jsonInput = JSON.stringify(input, null, 2);
      child.stdin?.write(jsonInput);
      child.stdin?.end();
    });
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

function createAsyncResultsMessage(asyncResults: string): Message {
  const instruction = `The following async subtasks and/or background jobs have completed while you were working. Review their outputs and take appropriate action based on the results:
- If the async work succeeded and no further action is needed, call attemptCompletion to finalize.
- If there are errors or issues that need to be addressed, take the necessary steps to resolve them.
- If the results require updates to your previous work, make those adjustments.

${asyncResults}`;
  return createUserMessage(prompts.createSystemReminder(instruction));
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
