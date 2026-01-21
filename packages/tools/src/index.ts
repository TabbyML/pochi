export { McpTool } from "./mcp-tools";
import {
  type ToolUIPart,
  type UIDataTypes,
  type UIMessagePart,
  type UITools,
  getToolName,
  isToolUIPart,
} from "ai";
import { applyDiff } from "./apply-diff";
import { askFollowupQuestion } from "./ask-followup-question";
import { attemptCompletion } from "./attempt-completion";
import { executeCommand } from "./execute-command";
import { globFiles } from "./glob-files";
import { listFiles } from "./list-files";
import type { multiApplyDiff } from "./multi-apply-diff";
import { type CustomAgent, createNewTaskTool } from "./new-task";
import { searchFiles } from "./search-files";
import { todoWrite } from "./todo-write";
export { Todo } from "./todo-write";
export { MediaOutput } from "./read-file";
export type {
  ToolFunctionType,
  PreviewToolFunctionType,
  PreviewReturnType,
} from "./types";
import { editNotebook } from "./edit-notebook";
import { killBackgroundJob } from "./kill-background-job";
import { readBackgroundJobOutput } from "./read-background-job-output";
import { createReadFileTool } from "./read-file";
import { startBackgroundJob } from "./start-background-job";
import { writeToFile } from "./write-to-file";

export {
  CustomAgent,
  overrideCustomAgentTools,
  type SubTask,
  inputSchema as newTaskInputSchema,
} from "./new-task";
export { attemptCompletionSchema } from "./attempt-completion";

export function isUserInputToolName(name: string): boolean {
  return name === "askFollowupQuestion" || name === "attemptCompletion";
}

export function isUserInputToolPart(part: UIMessagePart<UIDataTypes, UITools>) {
  if (!isToolUIPart(part)) return false;
  return isUserInputToolName(getToolName(part));
}

export function isAutoSuccessToolName(name: string): boolean {
  return (
    isUserInputToolName(name) ||
    ToolsByPermission.default.some((tool) => name === tool)
  );
}

export function isAutoSuccessToolPart(part: ToolUIPart): boolean {
  if (!isToolUIPart(part)) return false;
  return isAutoSuccessToolName(getToolName(part));
}

export type ToolName = keyof ClientTools;

export const ToolsByPermission = {
  read: [
    ...([
      "readFile",
      "listFiles",
      "globFiles",
      "searchFiles",
      "readBackgroundJobOutput",
    ] satisfies ToolName[]),

    // Pochi offered-tools
    "webFetch",
    "webSearch",
  ] as string[],
  write: [
    "writeToFile",
    "applyDiff",
    "editNotebook",
  ] satisfies ToolName[] as string[],
  execute: [
    "executeCommand",
    "startBackgroundJob",
    "killBackgroundJob",
    "newTask",
  ] satisfies ToolName[] as string[],
  default: ["todoWrite"] satisfies ToolName[] as string[],
};

export const ServerToolApproved = "<server-tool-approved>";

const createCliTools = (options?: CreateToolOptions) => ({
  applyDiff,
  askFollowupQuestion,
  attemptCompletion,
  executeCommand,
  globFiles,
  listFiles,
  readFile: createReadFileTool(options?.contentType),
  searchFiles,
  todoWrite,
  writeToFile,
  editNotebook,
  newTask: createNewTaskTool(options?.customAgents),
});

export interface CreateToolOptions {
  customAgents?: CustomAgent[];
  contentType?: string[];
}

export const createClientTools = (options?: CreateToolOptions) => {
  return {
    ...createCliTools(options),
    startBackgroundJob,
    readBackgroundJobOutput,
    killBackgroundJob,
  };
};

export type ClientTools = ReturnType<typeof createClientTools> & {
  multiApplyDiff: multiApplyDiff;
};

export const selectClientTools = (
  options: {
    isSubTask: boolean;
  } & CreateToolOptions,
) => {
  const clientTools = createClientTools(options);

  if (options?.isSubTask) {
    const { newTask, ...rest } = clientTools;
    return rest;
  }

  return clientTools;
};
