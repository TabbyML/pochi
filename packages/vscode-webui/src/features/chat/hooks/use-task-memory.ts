import { useTaskMemoryState } from "@/lib/hooks/use-task-memory-state";
import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { constants, getLogger, prompts } from "@getpochi/common";
import type {
  ContextWindowUsage,
  TaskMemoryState,
} from "@getpochi/common/vscode-webui-bridge";
import { type Message, catalog } from "@getpochi/livekit";
import { useCallback, useEffect } from "react";
import { createForkAgent } from "../lib/create-fork-agent";

const logger = getLogger("useTaskMemory");

/** Tools the memory extraction fork agent is allowed to call */
const TaskMemoryAllowedTools = ["writeToFile", "readFile"];

/** Statuses that mean the fork agent task is still running */
const ActiveStatuses = new Set(["pending-model", "pending-tool"]);
const IdleTaskId = "__task_memory_idle__";

type ExtractionData = {
  messages: Message[];
  contextWindowUsage?: ContextWindowUsage;
};

type ExtractionMetrics = {
  tokens: number;
  toolCalls: number;
};

function getExtractionMetrics(data: ExtractionData): ExtractionMetrics {
  return {
    tokens: computeTotalTokens(data.contextWindowUsage),
    toolCalls: countToolCalls(data.messages),
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
  return {
    ...state,
    initialized: true,
    isExtracting: true,
    lastExtractionTokens: metrics.tokens,
    lastExtractionToolCalls: metrics.toolCalls,
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

  // Watch the active fork agent task for completion
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

    // The active task is no longer running, so we mark extraction as complete
    setTaskMemoryState({
      ...taskMemoryState,
      isExtracting: false,
      extractionCount: activeTask
        ? taskMemoryState.extractionCount + 1
        : taskMemoryState.extractionCount,
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

      void createForkAgent({
        store,
        label: "task-memory",
        parentTaskId: taskId,
        parentMessages: data.messages,
        parentCwd,
        directive: prompts.taskMemory.buildExtractionDirective(existingMemory),
        allowedTools: TaskMemoryAllowedTools,
        setAsyncAgentState: async (asyncTaskId, state) => {
          const result = await vscodeHost.readAsyncAgentState(asyncTaskId);
          await result.setAsyncAgentState(state);
        },
      })
        .then((config) => {
          logger.debug(
            "Task memory extraction fork agent created with config:",
            config,
          );
          // AsyncAgentRunner observes runnableTasks$ via store.useQuery, so the
          // taskInited commit in createForkAgent is picked up on the next render.
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
          });
        });

      return true;
    },
    [isSubTask, store, taskId, parentCwd, setTaskMemoryState, taskMemoryState],
  );

  return {
    tryExtractTaskMemory,
  };
}
