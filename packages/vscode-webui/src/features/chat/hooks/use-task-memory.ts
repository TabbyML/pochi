import { useTaskMemoryState } from "@/lib/hooks/use-task-memory-state";
import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { getLogger, prompts } from "@getpochi/common";
import { catalog } from "@getpochi/livekit";
import type { ToolSpecInput } from "@getpochi/tools";
import { useCallback, useEffect } from "react";
import {
  buildForkAgentInitTitle,
  createForkAgent,
} from "../lib/create-fork-agent";
import {
  type ExtractionData,
  getExtractionMetrics,
  shouldExtractTaskMemory,
  toExtractingState,
} from "../lib/task-memory-extraction";

const logger = getLogger("useTaskMemory");

/** Tools the extraction fork agent may call. */
const TaskMemoryAllowedTools: readonly ToolSpecInput[] = [
  "readFile",
  "writeToFile(pochi://-/memory.md)",
];

/** Fork-agent statuses that mean it is still running. */
const ActiveStatuses = new Set(["pending-model", "pending-tool"]);
const IdleTaskId = "__task_memory_idle__";

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
