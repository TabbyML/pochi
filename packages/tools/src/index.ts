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
import { multiApplyDiff } from "./multi-apply-diff";
import { type CustomAgent, createNewTaskTool } from "./new-task";
import { readFile } from "./read-file";
import { searchFiles } from "./search-files";
import { todoWrite } from "./todo-write";
export { Todo } from "./todo-write";
export type {
  ToolFunctionType,
  PreviewToolFunctionType,
} from "./types";
import { killBackgroundJob } from "./kill-background-job";
import { readBackgroundJobOutput } from "./read-background-job-output";
import { startBackgroundJob } from "./start-background-job";
import { writeToFile } from "./write-to-file";
export {
  CustomAgent,
  overrideCustomAgentTools,
} from "./new-task";
export type { SubTask } from "./new-task";

export function isUserInputToolName(name: string): boolean {
  return name === "askFollowupQuestion" || name === "attemptCompletion";
}

export function isUserInputToolPart(part: UIMessagePart<UIDataTypes, UITools>) {
  if (!isToolUIPart(part)) return false;
  return isUserInputToolName(getToolName(part));
}

export function isAutoApproveToolName(name: string): boolean {
  return ToolsByPermission.default.some((tool) => name === tool);
}

export function isAutoApproveTool(part: ToolUIPart): boolean {
  return isAutoApproveToolName(getToolName(part));
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
    "multiApplyDiff",
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

const createCliTools = (customAgents?: CustomAgent[]) => ({
  applyDiff,
  askFollowupQuestion,
  attemptCompletion,
  executeCommand,
  globFiles,
  listFiles,
  multiApplyDiff,
  readFile,
  searchFiles,
  todoWrite,
  writeToFile,
  newTask: createNewTaskTool(customAgents),
});

export const createClientTools = (customAgents?: CustomAgent[]) => {
  return {
    ...createCliTools(customAgents),
    startBackgroundJob,
    readBackgroundJobOutput,
    killBackgroundJob,
  };
};

export type ClientTools = ReturnType<typeof createClientTools>;

export const selectClientTools = (options: {
  isSubTask: boolean;
  isCli: boolean;
  customAgents?: CustomAgent[];
}) => {
  const cliTools = createCliTools(options.customAgents);
  if (options.isCli) {
    if (options.isSubTask) {
      const { newTask, ...rest } = cliTools;
      return rest;
    }

    // CLI support new task
    return cliTools;
  }

  const clientTools = createClientTools(options.customAgents);

  if (options?.isSubTask) {
    const { newTask, ...rest } = clientTools;
    return rest;
  }

  return clientTools;
};
