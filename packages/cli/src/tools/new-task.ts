import type {
  ClientTools,
  CustomAgent,
  ToolFunctionType,
} from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

/**
 * Creates the newTask tool for CLI runner with custom agent support.
 * Creates and executes sub-tasks autonomously.
 */
export const newTask =
  (options: ToolCallOptions): ToolFunctionType<ClientTools["newTask"]> =>
  async ({ _meta, agentType }) => {
    const taskId = _meta?.uid || crypto.randomUUID();

    if (!options.createSubTaskRunner) {
      throw new Error(
        "createSubTaskRunner function is required for sub-task execution",
      );
    }

    // Find the custom agent if agentType is specified
    let customAgent: CustomAgent | undefined;
    if (agentType && options.customAgents) {
      customAgent = options.customAgents.find(
        (agent) => agent.name === agentType,
      );
      if (!customAgent) {
        throw new Error(
          `Custom agent type "${agentType}" not found. Available agents: ${options.customAgents.map((a) => a.name).join(", ")}`,
        );
      }
    }

    const subTaskRunner = options.createSubTaskRunner(taskId, customAgent);

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
    }

    return {
      result:
        typeof result === "string" ? result : "Sub-task completed successfully",
    };
  };
