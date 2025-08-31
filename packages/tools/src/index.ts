export { McpTool } from "./mcp-tools";
import type { ToolUIPart, UIDataTypes, UIMessagePart, UITools } from "ai";
import { applyDiff } from "./apply-diff";
import { askFollowupQuestion } from "./ask-followup-question";
import { attemptCompletion } from "./attempt-completion";
import { executeCommand } from "./execute-command";
import { globFiles } from "./glob-files";
import { listFiles } from "./list-files";
import { multiApplyDiff } from "./multi-apply-diff";
import { newTask } from "./new-task";
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
export type { SubTask } from "./new-task";

export function isUserInputToolPart(part: UIMessagePart<UIDataTypes, UITools>) {
  return (
    part.type === "tool-askFollowupQuestion" ||
    part.type === "tool-attemptCompletion"
  );
}

export function isAutoApproveTool(part: ToolUIPart): boolean {
  return ToolsByPermission.default.some((tool) => part.type === `tool-${tool}`);
}

type ToolName = keyof typeof ClientTools;

export const ToolsByPermission = {
  read: [
    "readFile",
    "listFiles",
    "globFiles",
    "searchFiles",
    "readBackgroundJobOutput",
  ] satisfies ToolName[] as string[],
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

const CliTools = {
  applyDiff,
  askFollowupQuestion,
  attemptCompletion,
  executeCommand,
  globFiles,
  listFiles,
  multiApplyDiff,
  newTask,
  readFile,
  searchFiles,
  todoWrite,
  writeToFile,
};

export const ClientTools = {
  ...CliTools,
  newTask,
  startBackgroundJob,
  readBackgroundJobOutput,
  killBackgroundJob,
};

export type ClientTools = typeof ClientTools;

export const selectClientTools = (options: {
  isSubTask: boolean;
  isCli: boolean;
}) => {
  if (options.isCli) {
    if (options?.isSubTask) {
      const {
        newTask,
        startBackgroundJob,
        readBackgroundJobOutput,
        killBackgroundJob,
        ...rest
      } = ClientTools;
      return rest;
    }

    // CLI support new task
    return {
      ...CliTools,
      newTask,
    };
  }

  if (options?.isSubTask) {
    const { newTask, ...rest } = ClientTools;
    return rest;
  }

  return ClientTools;
};
