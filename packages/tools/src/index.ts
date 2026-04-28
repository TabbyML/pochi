export { McpTool } from "./mcp-tools";
import { ToolsByPermission } from "./constants";
export { ToolsByPermission, MaxToolCallConcurrency } from "./constants";
import {
  type Tool,
  type UIDataTypes,
  type UIMessagePart,
  type UITools,
  getStaticToolName,
  isStaticToolUIPart,
} from "ai";
import type { z } from "zod";
import { applyDiff } from "./apply-diff";
import { askFollowupQuestion } from "./ask-followup-question";
import { createAttemptCompletionTool } from "./attempt-completion";
import { createReview } from "./create-review";
import { executeCommand } from "./execute-command";
import { globFiles } from "./glob-files";
import { listFiles } from "./list-files";
import type { multiApplyDiff } from "./multi-apply-diff";
import { type CustomAgent, createNewTaskTool } from "./new-task";
import { searchFiles } from "./search-files";
import { todoWrite } from "./todo-write";
export { Todo } from "./todo-write";
export { MediaOutput } from "./read-file";
export type { ToolFunctionType, IFileStateCache, IFileState } from "./types";
export type {
  AskFollowupQuestionInput,
  Question,
  QuestionOption,
} from "./ask-followup-question";
export { QuestionSchema } from "./ask-followup-question";
import { editNotebook } from "./edit-notebook";
import { killBackgroundJob } from "./kill-background-job";
import { readBackgroundJobOutput } from "./read-background-job-output";
import { createReadFileTool } from "./read-file";
import { startBackgroundJob } from "./start-background-job";
import { type Skill, createSkillTool } from "./use-skill";
import { parseToolSpec } from "./utils";
import { writeToFile } from "./write-to-file";

export {
  CustomAgent,
  type SubTask,
  inputSchema as newTaskInputSchema,
} from "./new-task";
export {
  type ParsedToolSpec,
  type ToolSpecInput,
  getAllowedToolNames,
  getToolArgs,
  normalizeToolSpecs,
  parseToolSpec,
  validateExecuteCommandWhitelist,
} from "./utils";
export { Skill } from "./use-skill";
export { attemptCompletionSchema } from "./attempt-completion";
export {
  BatchExecutionErrorMessages,
  BatchExecutionError,
  executeToolCalls,
  isSafeToBatchToolCall,
  partitionToolCalls,
} from "./utils/batch-utils";
export { ToolCallQueue } from "./utils/tool-call-queue";
export type { ToolCallQueueOptions } from "./utils/tool-call-queue";
export {
  checkReadOnlyConstraints,
  isReadonlyToolCall,
} from "./utils/readonly-constraints-validation";
export type {
  BatchedToolCallCancelReason as ToolCallCancelReason,
  BatchedToolCallResult,
  BatchedToolCall,
} from "./utils/batch-utils";

export function isUserInputToolName(name: string): boolean {
  return name === "askFollowupQuestion" || name === "attemptCompletion";
}

export function isUserInputToolPart(part: UIMessagePart<UIDataTypes, UITools>) {
  if (!isStaticToolUIPart(part)) return false;
  return isUserInputToolName(getStaticToolName(part));
}

export function isAutoSuccessToolName(name: string): boolean {
  return (
    isUserInputToolName(name) ||
    ToolsByPermission.default.some((tool) => name === tool)
  );
}

export function isAutoSuccessToolPart(
  part: UIMessagePart<UIDataTypes, UITools>,
): boolean {
  if (!isStaticToolUIPart(part)) return false;
  return isAutoSuccessToolName(getStaticToolName(part));
}

export type ToolName = keyof ClientTools;

export const ServerToolApproved = "<server-tool-approved>";

export interface CreateClientToolOptions {
  customAgents?: CustomAgent[];
  skills?: Skill[];
  contentType?: string[];
  attemptCompletionSchema?: z.ZodAny;
  agent?: CustomAgent;
}

const createCliTools = (options?: CreateClientToolOptions) => ({
  applyDiff,
  askFollowupQuestion,
  attemptCompletion: createAttemptCompletionTool(
    options?.attemptCompletionSchema,
  ),
  executeCommand,
  globFiles,
  listFiles,
  readFile: createReadFileTool(options?.contentType),
  useSkill: createSkillTool(options?.skills),
  searchFiles,
  todoWrite,
  writeToFile,
  editNotebook,
  newTask: createNewTaskTool(options?.customAgents),
});

export const createClientTools = (options?: CreateClientToolOptions) => {
  return {
    ...createCliTools(options),
    startBackgroundJob,
    readBackgroundJobOutput,
    killBackgroundJob,
  };
};

export type ClientTools = ReturnType<typeof createClientTools> & {
  multiApplyDiff: multiApplyDiff;
  createReview: createReview;
};

type ToolMap = Record<string, Tool>;

type AgentTools = ToolMap &
  Partial<
    ReturnType<typeof createClientTools> & {
      createReview: createReview;
    }
  >;

type SelectAgentToolsOptions = {
  isSubTask: boolean;
  mcpTools?: ToolMap;
} & CreateClientToolOptions;

const RequiredAgentTools = ["todoWrite", "attemptCompletion", "useSkill"];

function isAgentToolDisabled(
  agentName: string,
  toolName: string,
  isSubTask: boolean,
): boolean {
  if (isSubTask && toolName === "newTask") return true;

  const canAskFollowupQuestion =
    agentName === "planner" || agentName === "guide";
  return toolName === "askFollowupQuestion" && !canAskFollowupQuestion;
}

function getAgentToolAllowList(
  agent: CustomAgent | undefined,
  isSubTask: boolean,
): Set<string> | undefined {
  /**
   * if no agent or no tools specified, we don't filter any tools.
   * TODO(zhanba): for subagent with no tools specified, we should inherit the parent agent's tools instead of allowing all tools.
   */
  if (!agent?.tools?.length) {
    return undefined;
  }

  const allowed = new Set<string>();

  for (const tool of agent.tools) {
    const { name } = parseToolSpec(tool);
    if (isAgentToolDisabled(agent.name, name, isSubTask)) continue;
    if (RequiredAgentTools.includes(name)) continue;
    allowed.add(name);
  }

  for (const name of RequiredAgentTools) {
    allowed.add(name);
  }

  return allowed;
}

function filterTools(
  tools: AgentTools,
  allowList: Set<string> | undefined,
): AgentTools {
  if (!allowList) return tools;

  return Object.fromEntries(
    Object.entries(tools).filter(([name]) => allowList.has(name)),
  ) as AgentTools;
}

export const selectAgentTools = (
  options: SelectAgentToolsOptions,
): AgentTools => {
  const { agent, mcpTools, isSubTask, ...toolOptions } = options;
  const allowList = getAgentToolAllowList(agent, options.isSubTask);

  const avaliableTools: AgentTools = {
    ...createClientTools(toolOptions),
    ...(mcpTools ?? {}),
  };

  if (agent?.name === "reviewer") {
    avaliableTools.createReview = createReview;
  }

  return filterTools(avaliableTools, allowList);
};
