import { useTaskMemoryState } from "@/lib/hooks/use-task-memory-state";
import { useDefaultStore } from "@/lib/use-default-store";
import { type ContextWindowUsage, getLogger } from "@getpochi/common";
import type { StartForkAgent } from "@getpochi/common/fork-agent";
import {
  TaskMemoryStoreFilePath,
  getExtractionMetrics,
  resolveTaskMemoryExtractionState,
  shouldExtractTaskMemory,
  startTaskMemoryExtraction,
} from "@getpochi/common/task-memory";
import { type Message, catalog } from "@getpochi/livekit";
import { useCallback, useEffect } from "react";
import { createBackgroundTaskFromForkAgent } from "../lib/create-background-task-from-fork-agent";

const logger = getLogger("useTaskMemory");

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

  // Watch the active extraction background task for completion.
  const activeTaskId = taskMemoryState.activeTaskId;
  const activeTask = store.useQuery(
    catalog.queries.makeTaskQuery(activeTaskId ?? IdleTaskId),
  );
  const activeMessageRows = store.useQuery(
    catalog.queries.makeMessagesQuery(activeTaskId ?? IdleTaskId),
  );

  useEffect(() => {
    if (
      !activeTaskId ||
      isSubTask ||
      !taskMemoryState.isExtracting ||
      !setTaskMemoryState
    )
      return;

    const nextState = resolveTaskMemoryExtractionState({
      state: taskMemoryState,
      activeTask,
      activeMessages: activeMessageRows.map((row) => row.data as Message),
    });
    if (nextState) setTaskMemoryState(nextState);
  }, [
    activeTaskId,
    activeTask,
    activeMessageRows,
    isSubTask,
    setTaskMemoryState,
    taskMemoryState,
  ]);

  const tryExtractTaskMemory = useCallback(
    (data: {
      messages: Message[];
      contextWindowUsage?: ContextWindowUsage;
    }) => {
      logger.debug("Attempting to extract task memory...");
      if (isSubTask || !setTaskMemoryState) return false;

      const metrics = getExtractionMetrics(data);

      logger.debug("Task memory extraction metrics:", metrics, taskMemoryState);

      if (!shouldExtractTaskMemory(taskMemoryState, metrics)) {
        return false;
      }

      logger.debug(
        "Task memory extraction will proceed with metrics:",
        metrics,
      );
      const parentTask = store.query(catalog.queries.makeTaskQuery(taskId));
      const memoryFile = store.query(
        catalog.queries.makeStoreFileQuery(TaskMemoryStoreFilePath),
      );
      const startTaskMemoryForkAgent: StartForkAgent<Message> = (agent) =>
        createBackgroundTaskFromForkAgent({
          store,
          agent,
        });

      void startTaskMemoryExtraction({
        state: taskMemoryState,
        metrics,
        setTaskMemoryState,
        startForkAgent: startTaskMemoryForkAgent,
        parentTaskId: taskId,
        parentMessages: data.messages,
        parentCwd,
        parentTaskTitle: parentTask?.title ?? undefined,
        existingMemory: memoryFile?.content ?? undefined,
      })
        .then((config) => {
          logger.debug(
            "Task memory extraction background task started with handle:",
            config,
          );
        })
        .catch(() => {});

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
