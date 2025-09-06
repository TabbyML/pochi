import type { UITools } from "@getpochi/livekit";
import type { ToolFunctionType } from "@getpochi/tools";
import { type ToolUIPart, getToolName } from "ai";
import type { ToolCallOptions } from "../types";
import { applyDiff } from "./apply-diff";
import { executeCommand } from "./execute-command";
import { globFiles } from "./glob-files";
import { listFiles } from "./list-files";
import { multiApplyDiff } from "./multi-apply-diff";
import { newTask } from "./new-task";
import { readFile } from "./read-file";
import { searchFiles } from "./search-files";
import { todoWrite } from "./todo-write";
import { writeToFile } from "./write-to-file";

const ToolMap: Record<
  string,
  // biome-ignore lint/suspicious/noExplicitAny: ToolFunctionType requires any for generic tool parameters
  (options: ToolCallOptions) => ToolFunctionType<any>
> = {
  readFile,
  applyDiff,
  globFiles,
  listFiles,
  multiApplyDiff,
  newTask,
  todoWrite,
  writeToFile,
  searchFiles,
  executeCommand,
};

export async function executeToolCall(
  tool: ToolUIPart<UITools>,
  options: ToolCallOptions,
  abortSignal?: AbortSignal,
) {
  const toolName = getToolName(tool);
  const toolFunction = ToolMap[toolName];
  if (!toolFunction) {
    return {
      error: `Tool ${toolName} not found.`,
    };
  }

  try {
    return await toolFunction(options)(tool.input, {
      messages: [],
      toolCallId: tool.toolCallId,
      abortSignal,
    });
  } catch (e) {
    return {
      error: toErrorString(e),
    };
  }
}

function toErrorString(e: unknown): string {
  if (e instanceof Error) {
    return e.message;
  }
  if (typeof e === "string") {
    return e;
  }
  return JSON.stringify(e);
}
