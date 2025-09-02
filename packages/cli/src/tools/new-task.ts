import { getLogger } from "@getpochi/common";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
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
  async ({ prompt, _meta }) => {
    const taskId = _meta?.uid || crypto.randomUUID();

    if (!options.createSubTaskRunner) {
      throw new Error(
        "createSubTaskRunner function is required for sub-task execution",
      );
    }

    // Get sub-task dependencies from the factory function
    const subTaskDeps = options.createSubTaskRunner();

    // Create sub-task runner with the same configuration as parent
    const subTaskOptions: RunnerOptions = {
      uid: taskId,
      llm: subTaskDeps.llm,
      apiClient: subTaskDeps.apiClient,
      store: subTaskDeps.store,
      prompt,
      cwd: options.cwd,
      rg: options.rg,
      maxSteps: 10, // Limit sub-task steps
      maxRetries: 3,
      isSubTask: true, // Mark this as a sub-task to prevent middleware duplication
      waitUntil: subTaskDeps.waitUntil,
    };

    const subTaskRunner = new TaskRunner(subTaskOptions);

    // Execute the sub-task
    await subTaskRunner.run();

    // Get the final state and extract result
    const finalState = subTaskRunner.state;
    const lastMessage = finalState.messages.at(-1);

    let result = "Sub-task completed";
    if (lastMessage?.role === "assistant") {
      for (const part of lastMessage.parts || []) {
        if (part.type === "tool-attemptCompletion") {
          if (part.input) {
            result = (part.input as { result: string }).result;
          }
          break;
        }
      }
    } else {
      logger.debug("No assistant message found in sub-task result");
    }

    return {
      result:
        typeof result === "string" ? result : "Sub-task completed successfully",
    };
  };
