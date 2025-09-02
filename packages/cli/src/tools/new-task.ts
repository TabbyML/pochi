import { getLogger } from "@getpochi/common";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
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

    const subTaskRunner = options.createSubTaskRunner(prompt, taskId);

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
