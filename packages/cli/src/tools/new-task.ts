import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";
import { ListrHelper } from "../listr-helper";

/**
 * Implements the newTask tool for CLI runner.
 * Creates and executes sub-tasks autonomously.
 */
export const newTask =
  (options: ToolCallOptions): ToolFunctionType<ClientTools["newTask"]> =>
  async ({ _meta }, { toolCallId }) => {
    const taskId = _meta?.uid || crypto.randomUUID();
    // 使用 toolCallId 作为注册键，这样 ListrHelper 可以找到对应的运行器
    const registrationKey = toolCallId;

    if (!options.createSubTaskRunner) {
      throw new Error(
        "createSubTaskRunner function is required for sub-task execution",
      );
    }

    const subTaskRunner = options.createSubTaskRunner(taskId);

    // 注册子任务运行器供 ListrHelper 监听（使用 toolCallId 作为键）
    ListrHelper.registerSubTaskRunner(registrationKey, subTaskRunner);

    try {
      // Execute the sub-task
      await subTaskRunner.run();
      
      // 给 listr 一些时间来检测完成状态，避免过早注销
      await new Promise(resolve => setTimeout(resolve, 1000));
    } finally {
      // 注销子任务运行器
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
