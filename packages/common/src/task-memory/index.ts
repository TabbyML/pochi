import { type ToolSpecInput, isUserInputToolPart } from "@getpochi/tools";
import { type UIMessage, isStaticToolUIPart } from "ai";
import {
  constants,
  type ContextWindowUsage,
  TaskMemoryFileUri,
  type TaskMemoryState,
  getLogger,
  prompts,
} from "../base";
import {
  type StartForkAgent,
  buildForkAgentInitTitle,
  createForkAgent,
} from "../fork-agent";

const logger = getLogger("TaskMemory");

export type ExtractionMetrics = {
  tokens: number;
  toolCalls: number;
  trailingMessageId: string | undefined;
  trailingMessageHasOpenToolCall: boolean;
};

type TaskMemoryExtractionResult = "pending" | "succeeded" | "failed";

export const DefaultTaskMemoryState: TaskMemoryState = {
  initialized: false,
  lastExtractionTokens: 0,
  lastExtractionToolCalls: 0,
  isExtracting: false,
  extractionCount: 0,
};

const TaskMemoryAllowedTools: readonly ToolSpecInput[] = [
  "readFile",
  `writeToFile(${TaskMemoryFileUri})`,
];

export const TaskMemoryStoreFilePath = new URL(TaskMemoryFileUri).pathname;

type SetTaskMemoryState = (state: TaskMemoryState) => Promise<void> | void;

export function getExtractionMetrics<TMessage extends UIMessage>(data: {
  messages: TMessage[];
  contextWindowUsage?: ContextWindowUsage;
}): ExtractionMetrics {
  const last = data.messages.at(-1);
  return {
    tokens: computeTotalTokens(data.contextWindowUsage),
    toolCalls: countToolCalls(data.messages),
    trailingMessageId: last?.id,
    trailingMessageHasOpenToolCall: lastMessageHasOpenToolCall(data.messages),
  };
}

export function shouldExtractTaskMemory(
  state: TaskMemoryState,
  metrics: ExtractionMetrics,
): boolean {
  if (state.isExtracting) return false;

  if (!state.initialized) {
    return metrics.tokens >= constants.TaskMemoryInitTokenThreshold;
  }

  const tokenDelta = metrics.tokens - state.lastExtractionTokens;
  const toolCallDelta = metrics.toolCalls - state.lastExtractionToolCalls;

  return (
    tokenDelta >= constants.TaskMemoryUpdateTokenIncrement &&
    toolCallDelta >= constants.TaskMemoryUpdateToolCallThreshold
  );
}

function toExtractingState(
  state: TaskMemoryState,
  metrics: ExtractionMetrics,
): TaskMemoryState {
  return {
    ...state,
    initialized: true,
    isExtracting: true,
    lastExtractionTokens: metrics.tokens,
    lastExtractionToolCalls: metrics.toolCalls,
    pendingExtractionMessageId: metrics.trailingMessageId,
  };
}

export async function startTaskMemoryExtraction<TMessage extends UIMessage>({
  state,
  metrics,
  setTaskMemoryState,
  startForkAgent,
  parentTaskId,
  parentMessages,
  parentCwd,
  parentTaskTitle,
  existingMemory,
}: {
  state: TaskMemoryState;
  metrics: ExtractionMetrics;
  setTaskMemoryState: SetTaskMemoryState;
  startForkAgent: StartForkAgent<TMessage>;
  parentTaskId: string;
  parentMessages: TMessage[];
  parentCwd: string | undefined;
  parentTaskTitle?: string;
  existingMemory?: string;
}) {
  const nextState = toExtractingState(state, metrics);
  await setTaskMemoryState(nextState);

  try {
    const agent = createForkAgent({
      label: "task-memory",
      initTitle: buildForkAgentInitTitle("task-memory", parentTaskTitle),
      parentTaskId,
      parentMessages,
      parentCwd,
      directive: prompts.taskMemory.buildExtractionDirective(existingMemory),
      tools: TaskMemoryAllowedTools,
    });
    const handle = await startForkAgent(agent);

    await setTaskMemoryState({
      ...nextState,
      activeTaskId: handle.taskId,
    });

    return handle;
  } catch (error) {
    logger.warn("Failed to start task-memory extraction fork agent", error);
    await setTaskMemoryState({
      ...nextState,
      isExtracting: false,
      activeTaskId: undefined,
      pendingExtractionMessageId: undefined,
    });
    throw error;
  }
}

export function resolveTaskMemoryExtractionState({
  state,
  activeTask,
  activeMessages,
}: {
  state: TaskMemoryState;
  activeTask: { status: string } | null | undefined;
  activeMessages: UIMessage[];
}): TaskMemoryState | undefined {
  if (!state.activeTaskId || !state.isExtracting) return undefined;

  const extractionResult = getTaskMemoryExtractionResult(
    activeTask,
    activeMessages,
  );
  if (extractionResult === "pending") return undefined;

  const succeeded = extractionResult === "succeeded";
  return {
    ...state,
    isExtracting: false,
    extractionCount: succeeded
      ? state.extractionCount + 1
      : state.extractionCount,
    lastExtractionMessageId: succeeded
      ? (state.pendingExtractionMessageId ?? state.lastExtractionMessageId)
      : state.lastExtractionMessageId,
    pendingExtractionMessageId: undefined,
    activeTaskId: undefined,
  };
}

function getTaskMemoryExtractionResult(
  task: { status: string } | null | undefined,
  messages: UIMessage[],
): TaskMemoryExtractionResult {
  for (const message of messages) {
    for (const part of message.parts) {
      if (
        isStaticToolUIPart(part) &&
        part.state === "output-available" &&
        isTaskMemoryPath(part.input)
      ) {
        return "succeeded";
      }
    }
  }

  if (!task) return "pending";
  if (task.status === "pending-model" || task.status === "pending-tool") {
    return "pending";
  }

  return "failed";
}

function lastMessageHasOpenToolCall(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return false;
  return last.parts.some((part) => {
    if (!isStaticToolUIPart(part) || isUserInputToolPart(part)) return false;
    return part.state !== "output-available" && part.state !== "output-error";
  });
}

function computeTotalTokens(usage?: ContextWindowUsage) {
  if (!usage) return 0;
  return (
    (usage.system ?? 0) +
    (usage.tools ?? 0) +
    (usage.messages ?? 0) +
    (usage.files ?? 0) +
    (usage.toolResults ?? 0) +
    (usage.projectMemory ?? 0)
  );
}

function countToolCalls(messages: UIMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (isStaticToolUIPart(part)) {
        count++;
      }
    }
  }
  return count;
}

function isTaskMemoryPath(input: unknown): boolean {
  if (!input || typeof input !== "object" || !("path" in input)) return false;
  return input.path === TaskMemoryFileUri;
}
