import { useAutoMemoryState } from "@/lib/hooks/use-auto-memory-state";
import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import { type AutoMemoryContext, getLogger } from "@getpochi/common";
import {
  didConversationWriteMemory,
  resolveAutoMemoryDreamState,
  resolveAutoMemoryExtractionState,
  serializeSessionTranscript,
  startAutoMemoryDream,
  startAutoMemoryExtraction,
} from "@getpochi/common/auto-memory";
import type { StartForkAgent } from "@getpochi/common/fork-agent";
import { type Message, catalog } from "@getpochi/livekit";
import { useCallback, useEffect } from "react";
import { createBackgroundTaskFromForkAgent } from "../lib/create-background-task-from-fork-agent";

const logger = getLogger("useAutoMemory");
const IdleTaskId = "__long_term_memory_idle__";

export function useAutoMemory({
  isSubTask,
  taskId,
  parentCwd,
}: {
  isSubTask: boolean;
  taskId: string;
  parentCwd: string | undefined;
}) {
  const store = useDefaultStore();
  const { autoMemoryState, setAutoMemoryState } = useAutoMemoryState(taskId);

  const activeExtractionTask = store.useQuery(
    catalog.queries.makeTaskQuery(
      autoMemoryState.activeExtractionTaskId ?? IdleTaskId,
    ),
  );
  const activeDreamTask = store.useQuery(
    catalog.queries.makeTaskQuery(
      autoMemoryState.activeDreamTaskId ?? IdleTaskId,
    ),
  );

  const startMemoryForkAgent: StartForkAgent<Message> = useCallback(
    (agent) =>
      createBackgroundTaskFromForkAgent({
        store,
        agent,
      }),
    [store],
  );

  const maybeStartDream = useCallback(
    async (baseState = autoMemoryState) => {
      if (!setAutoMemoryState || baseState.isDreaming || baseState.isExtracting)
        return;

      try {
        const run = await vscodeHost.beginAutoMemoryDream({ cwd: parentCwd });
        const parentTask = store.query(catalog.queries.makeTaskQuery(taskId));
        await startAutoMemoryDream({
          state: baseState,
          setAutoMemoryState,
          startForkAgent: startMemoryForkAgent,
          parentCwd,
          parentTaskId: taskId,
          parentTaskTitle: parentTask?.title ?? undefined,
          run,
          finishAutoMemoryDream: (options) =>
            vscodeHost.finishAutoMemoryDream(options),
        });
      } catch (error) {
        logger.warn("Failed to create long-term memory dream task", error);
      }
    },
    [
      autoMemoryState,
      startMemoryForkAgent,
      parentCwd,
      setAutoMemoryState,
      store,
      taskId,
    ],
  );

  useEffect(() => {
    if (
      !setAutoMemoryState ||
      !autoMemoryState.isExtracting ||
      !autoMemoryState.activeExtractionTaskId
    ) {
      return;
    }

    const resolved = resolveAutoMemoryExtractionState({
      state: autoMemoryState,
      activeExtractionTask,
    });
    if (!resolved) return;

    setAutoMemoryState(resolved.nextState);
    if (resolved.success) {
      void maybeStartDream(resolved.nextState);
    }
  }, [
    activeExtractionTask,
    autoMemoryState,
    maybeStartDream,
    setAutoMemoryState,
  ]);

  useEffect(() => {
    if (
      !setAutoMemoryState ||
      !autoMemoryState.isDreaming ||
      !autoMemoryState.activeDreamTaskId ||
      !autoMemoryState.activeDreamToken ||
      !autoMemoryState.activeDreamMemoryDir ||
      autoMemoryState.activeDreamPreviousLastDreamAt === undefined
    ) {
      return;
    }
    const resolved = resolveAutoMemoryDreamState({
      state: autoMemoryState,
      activeDreamTask,
    });
    if (!resolved) return;

    void vscodeHost.finishAutoMemoryDream(resolved.finish);
    setAutoMemoryState(resolved.nextState);
  }, [activeDreamTask, autoMemoryState, setAutoMemoryState]);

  const startExtraction = useCallback(
    async ({
      context,
      messages,
      previousMessageCount,
      messageCount,
    }: {
      context: AutoMemoryContext;
      messages: Message[];
      previousMessageCount: number;
      messageCount: number;
    }) => {
      try {
        const parentTask = store.query(catalog.queries.makeTaskQuery(taskId));
        await startAutoMemoryExtraction({
          state: autoMemoryState,
          setAutoMemoryState: setAutoMemoryState ?? (() => {}),
          startForkAgent: startMemoryForkAgent,
          parentCwd,
          parentTaskId: taskId,
          parentTaskTitle: parentTask?.title ?? undefined,
          context,
          messages,
          previousMessageCount,
          messageCount,
        });
      } catch (error) {
        logger.warn("Failed to create long-term memory extraction task", error);
      }
    },
    [
      autoMemoryState,
      startMemoryForkAgent,
      parentCwd,
      setAutoMemoryState,
      store,
      taskId,
    ],
  );

  const writeCurrentTranscript = useCallback(
    async (messages: readonly Message[]) => {
      const transcript = serializeSessionTranscript(messages);
      if (!transcript) return;
      try {
        await vscodeHost.writeTaskTranscript({
          taskId,
          cwd: parentCwd,
          updatedAt: Date.now(),
          transcript,
        });
      } catch (error) {
        logger.warn("Failed to write task transcript", error);
      }
    },
    [parentCwd, taskId],
  );

  const tryUpdateAutoMemory = useCallback(
    (data: { messages: Message[]; status?: string }) => {
      if (isSubTask || !setAutoMemoryState) return false;
      if (data.status && data.status !== "completed") return false;

      void (async () => {
        const context = await vscodeHost.readAutoMemory({ cwd: parentCwd });
        if (!context) return;

        // Always dump the current task's transcript to disk first so the
        // dream agent can read it on demand. Only this panel writes its
        // own transcript — no cross-store hydration needed elsewhere.
        await writeCurrentTranscript(data.messages);

        const lastExtractionMessageCount =
          autoMemoryState.lastExtractionMessageCount;
        const messageCount = data.messages.length;
        let extractionStarted = false;
        let stateForDream = autoMemoryState;

        if (
          !autoMemoryState.isExtracting &&
          messageCount > lastExtractionMessageCount
        ) {
          if (
            didConversationWriteMemory(
              data.messages.slice(lastExtractionMessageCount),
              context.memoryDir,
              parentCwd,
            )
          ) {
            stateForDream = {
              ...autoMemoryState,
              lastExtractionMessageCount: messageCount,
            };
            setAutoMemoryState(stateForDream);
          } else {
            await startExtraction({
              context,
              messages: data.messages,
              previousMessageCount: lastExtractionMessageCount,
              messageCount,
            });
            extractionStarted = true;
          }
        }

        if (!extractionStarted) {
          await maybeStartDream(stateForDream);
        }
      })().catch((error) => {
        logger.warn("Long-term memory update failed", error);
      });

      return true;
    },
    [
      isSubTask,
      autoMemoryState,
      maybeStartDream,
      parentCwd,
      setAutoMemoryState,
      startExtraction,
      writeCurrentTranscript,
    ],
  );

  return {
    tryUpdateAutoMemory,
  };
}
