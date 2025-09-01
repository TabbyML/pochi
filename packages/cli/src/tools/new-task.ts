import { getLogger } from "@getpochi/common";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolUIPart } from "ai";
import { TaskRunner } from "../task-runner";
import type { RunnerOptions } from "../task-runner";
import type { ToolCallOptions } from "../types";

const logger = getLogger("NewTaskTool");

/**
 * Implements the newTask tool for CLI runner.
 * Creates and executes sub-tasks autonomously.
 */
export const newTask =
  (options: ToolCallOptions): ToolFunctionType<ClientTools["newTask"]> =>
  async ({ description, prompt, _meta, _transient }) => {
    if (!description || !prompt) {
      throw new Error(
        "Description and prompt are required for creating a new task.",
      );
    }

    // If this is a transient task (already executed), return the cached result
    if (_transient?.task) {
      logger.debug("Returning cached sub-task result");
      return {
        result: (() => {
          const message = _transient.task.messages.find(
            (msg) =>
              msg.role === "assistant" &&
              msg.parts?.some((part) => part.type === "tool-attemptCompletion"),
          );
          if (!message) {
            return "Task completed with no completion message";
          }
          const completionPart = message.parts?.find(
            (part) => part.type === "tool-attemptCompletion",
          ) as ToolUIPart | undefined;
          return (
            (completionPart?.input as { result?: string })?.result ||
            "Task completed"
          );
        })(),
      };
    }

    const taskId = _meta?.uid || crypto.randomUUID();

    try {
      if (!options.apiClient || !options.store) {
        throw new Error(
          "API client and store are required for sub-task execution",
        );
      }

      // Create sub-task runner with the same configuration as parent
      const subTaskOptions: RunnerOptions = {
        uid: taskId,
        llm: options.llm || {
          type: "pochi",
          modelId: "anthropic/claude-4-sonnet",
          apiClient: options.apiClient,
        },
        apiClient: options.apiClient,
        store: options.store,
        prompt,
        cwd: options.cwd,
        rg: options.rg,
        maxSteps: 10, // Limit sub-task steps
        maxRetries: 3,
        isSubTask: true, // Mark this as a sub-task to prevent middleware duplication
        waitUntil: options.waitUntil,
      };

      const subTaskRunner = new TaskRunner(subTaskOptions);

      // Execute the sub-task
      await subTaskRunner.run();

      // Get the final state and extract result
      const finalState = subTaskRunner.state;
      const lastMessage = finalState.messages.at(-1);

      let result = "Sub-task completed";
      if (lastMessage?.role === "assistant") {
        const completionPart = lastMessage.parts?.find(
          (part) => part.type === "tool-attemptCompletion",
        ) as ToolUIPart | undefined;
        if (
          completionPart?.input &&
          typeof completionPart.input === "object" &&
          "result" in completionPart.input
        ) {
          result = (completionPart.input as { result: string }).result;
        }
      } else {
        logger.debug("No assistant message found in sub-task result");
      }

      logger.debug(`Sub-task completed with result: ${result}`);

      return {
        result:
          typeof result === "string"
            ? result
            : "Sub-task completed successfully",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Sub-task execution failed: ${errorMessage}`);

      // Return a successful response with error information rather than throwing
      // This prevents the parent task from failing when a sub-task fails
      return {
        result: `Sub-task failed: ${errorMessage}`,
      };
    }
  };
