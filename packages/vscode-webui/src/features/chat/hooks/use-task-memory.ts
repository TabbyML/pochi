import { useTaskMemoryState } from "@/lib/hooks/use-task-memory-state";
import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import type { ContextWindowUsage, TaskMemoryState } from "@getpochi/common";
import { constants, getLogger, prompts } from "@getpochi/common";
import { type Message, catalog } from "@getpochi/livekit";
import type { ToolSpecInput } from "@getpochi/tools";
import { useCallback, useEffect } from "react";
import {
  buildForkAgentInitTitle,
  createForkAgent,
} from "../lib/create-fork-agent";

const logger = getLogger("useTaskMemory");

/** Tools the extraction fork agent may call. */
const TaskMemoryAllowedTools: readonly ToolSpecInput[] = [
  "readFile",
  "writeToFile(pochi://-/memory.md)",
];

/** Fork-agent statuses that mean it is still running. */
const ActiveStatuses = new Set(["pending-model", "pending-tool"]);
const IdleTaskId = "__task_memory_idle__";

type ExtractionData = {
  messages: Message[];
  contextWindowUsage?: ContextWindowUsage;
};

type ExtractionMetrics = {
  tokens: number;
  toolCalls: number;
  trailingMessageId: string | undefined;
  trailingMessageHasOpenToolCall: boolean;
};

function getExtractionMetrics(data: ExtractionData): ExtractionMetrics {
  const last = data.messages.at(-1);
  return {
    tokens: computeTotalTokens(data.contextWindowUsage),
    toolCalls: countToolCalls(data.messages),
    trailingMessageId: last?.id,
    trailingMessageHasOpenToolCall: lastMessageHasOpenToolCall(data.messages),
  };
}

function computeTotalTokens(usage?: ContextWindowUsage) {
  if (!usage) return 0;
  return (
    usage.system +
    usage.tools +
    usage.messages +
    usage.files +
    usage.toolResults
  );
}

function countToolCalls(messages: Message[]): number {
  let count = 0;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type.startsWith("tool-")) {
        count++;
      }
    }
  }
  return count;
}

/** True if the trailing assistant turn has tool calls without output yet. */
function lastMessageHasOpenToolCall(messages: Message[]): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return false;
  return last.parts.some((part) => {
    if (!part.type.startsWith("tool-")) return false;
    if (!("state" in part)) return false;
    const state = (part as { state: string }).state;
    return state !== "output-available" && state !== "output-error";
  });
}

function shouldExtractTaskMemory(
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
  // Skip the boundary when the snapshot is mid-tool-call to avoid
  // slicing through a tool_use/tool_result pair on the next compaction.
  return {
    ...state,
    initialized: true,
    isExtracting: true,
    lastExtractionTokens: metrics.tokens,
    lastExtractionToolCalls: metrics.toolCalls,
    pendingExtractionMessageId: metrics.trailingMessageHasOpenToolCall
      ? undefined
      : metrics.trailingMessageId,
  };
}

export function useTaskMemory({
  isSubTask,
  taskId,
  parentCwd,
}: {
  isSubTask: boolean;
  taskId: string;
  parentCwd: string | undefined;
}) {
  const store = useDefaultStore();
  const { taskMemoryState, setTaskMemoryState } = useTaskMemoryState(taskId);

  // Watch the active fork-agent task for completion.
  const activeTaskId = taskMemoryState.activeTaskId;
  const activeTask = store.useQuery(
    catalog.queries.makeTaskQuery(activeTaskId ?? IdleTaskId),
  );

  useEffect(() => {
    if (
      !activeTaskId ||
      isSubTask ||
      !taskMemoryState.isExtracting ||
      !setTaskMemoryState
    )
      return;

    if (activeTask && ActiveStatuses.has(activeTask.status)) return;

    // Extraction finished — on success, promote the pending boundary id.
    const succeeded = !!activeTask;
    setTaskMemoryState({
      ...taskMemoryState,
      isExtracting: false,
      extractionCount: succeeded
        ? taskMemoryState.extractionCount + 1
        : taskMemoryState.extractionCount,
      lastExtractionMessageId: succeeded
        ? (taskMemoryState.pendingExtractionMessageId ??
          taskMemoryState.lastExtractionMessageId)
        : taskMemoryState.lastExtractionMessageId,
      pendingExtractionMessageId: undefined,
      activeTaskId: undefined,
    });
  }, [
    activeTaskId,
    activeTask,
    isSubTask,
    setTaskMemoryState,
    taskMemoryState,
  ]);

  const tryExtractTaskMemory = useCallback(
    (data: ExtractionData) => {
      logger.debug("Attempting to extract task memory...");
      if (isSubTask || !setTaskMemoryState) return false;

      const metrics = getExtractionMetrics(data);

      logger.debug("Task memory extraction metrics:", metrics, taskMemoryState);

      if (!shouldExtractTaskMemory(taskMemoryState, metrics)) {
        return false;
      }

      const nextState = toExtractingState(taskMemoryState, metrics);

      logger.debug(
        "Task memory extraction will proceed with next state:",
        nextState,
      );
      setTaskMemoryState(nextState);

      const memoryFile = store.query(
        catalog.queries.makeStoreFileQuery("/memory.md"),
      );
      const existingMemory = memoryFile?.content ?? undefined;

      logger.debug("Existing task memory content:", existingMemory);

      const parentTask = store.query(catalog.queries.makeTaskQuery(taskId));
      const initTitle = buildForkAgentInitTitle(
        "task-memory",
        parentTask?.title ?? undefined,
      );

      void createForkAgent({
        store,
        label: "task-memory",
        initTitle,
        parentTaskId: taskId,
        parentMessages: data.messages,
        parentCwd,
        directive: prompts.taskMemory.buildExtractionDirective(existingMemory),
        tools: TaskMemoryAllowedTools,
        setBackgroundTaskState: async (backgroundTaskId, state) => {
          const result =
            await vscodeHost.readBackgroundTaskState(backgroundTaskId);
          await result.setBackgroundTaskState(state);
        },
      })
        .then((config) => {
          logger.debug(
            "Task memory extraction fork agent created with config:",
            config,
          );
          // BackgroundTaskRunner picks up the taskInited commit on the next render.
          setTaskMemoryState({
            ...nextState,
            activeTaskId: config.taskId,
          });
        })
        .catch(() => {
          setTaskMemoryState({
            ...nextState,
            isExtracting: false,
            activeTaskId: undefined,
            pendingExtractionMessageId: undefined,
          });
        });

      return true;
    },
    [isSubTask, store, taskId, parentCwd, setTaskMemoryState, taskMemoryState],
  );

  return {
    tryExtractTaskMemory,
    taskMemoryState,
    setTaskMemoryState,
  };
}
