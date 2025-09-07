import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import { ListrHelper } from "../listr-helper";
import type { ToolCallOptions } from "../types";

/**
 * Implements the newTask tool for CLI runner.
 * Creates and executes sub-tasks autonomously.
 */
export const newTask =
  (options: ToolCallOptions): ToolFunctionType<ClientTools["newTask"]> =>
  async ({ _meta }, { toolCallId }) => {
    const taskId = _meta?.uid || crypto.randomUUID();
    // Use toolCallId as registration key so ListrHelper can find the corresponding runner
    const registrationKey = toolCallId;

    if (!options.createSubTaskRunner) {
      throw new Error(
        "createSubTaskRunner function is required for sub-task execution",
      );
    }

    const subTaskRunner = options.createSubTaskRunner(taskId);

    // Register sub-task runner for ListrHelper monitoring (using toolCallId as key)
    ListrHelper.registerSubTaskRunner(registrationKey, subTaskRunner);

    try {
      // Execute the sub-task
      await subTaskRunner.run();

      // Give listr some time to detect completion status, avoid premature cleanup
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } finally {
      // Unregister sub-task runner
      ListrHelper.unregisterSubTaskRunner(registrationKey);
    }

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
    }

    return {
      result:
        typeof result === "string" ? result : "Sub-task completed successfully",
    };
  };
