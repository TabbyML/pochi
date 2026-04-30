import { useAutoMemoryState } from "@/lib/hooks/use-auto-memory-state";
import { getOrLoadTaskStore, useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import {
  type AutoMemoryContext,
  type AutoMemoryDreamSession,
  getLogger,
  prompts,
} from "@getpochi/common";
import { encodeStoreId } from "@getpochi/common/store-id-utils";
import { type Message, catalog } from "@getpochi/livekit";
import type { ToolSpecInput } from "@getpochi/tools";
import type { StoreRegistry } from "@livestore/livestore";
import { threadSignal } from "@quilted/threads/signals";
import { useCallback, useEffect } from "react";
import { createForkAgent } from "../lib/create-fork-agent";

const logger = getLogger("useAutoMemory");
const ActiveStatuses = new Set(["pending-model", "pending-tool"]);
const IdleTaskId = "__long_term_memory_idle__";
const MemoryReadToolNames = [
  "readFile",
  "listFiles",
  "globFiles",
  "searchFiles",
] as const;
const MemoryWriteToolNames = ["writeToFile", "applyDiff"] as const;
const MemoryWriteTools = new Set(["writeToFile", "applyDiff", "editNotebook"]);
const MaxDreamTranscriptChars = 120_000;
const MaxSessionTranscriptChars = 24_000;
const MaxPartChars = 4_000;

type StreamFinishData = {
  messages: Message[];
  status?: string;
};

type HistoryTask = {
  id: string;
  parentId?: string | null;
  cwd?: string | null;
  updatedAt?: number;
  runAsync?: boolean | number | null;
};

export function useAutoMemory({
  isSubTask,
  taskId,
  parentCwd,
  storeRegistry,
  jwt,
}: {
  isSubTask: boolean;
  taskId: string;
  parentCwd: string | undefined;
  storeRegistry: StoreRegistry;
  jwt: string | null;
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

  useEffect(() => {
    if (
      !setAutoMemoryState ||
      !autoMemoryState.isExtracting ||
      !autoMemoryState.activeExtractionTaskId
    ) {
      return;
    }
    if (
      activeExtractionTask &&
      ActiveStatuses.has(activeExtractionTask.status)
    ) {
      return;
    }

    setAutoMemoryState({
      ...autoMemoryState,
      isExtracting: false,
      extractionCount: activeExtractionTask
        ? autoMemoryState.extractionCount + 1
        : autoMemoryState.extractionCount,
      activeExtractionTaskId: undefined,
    });
  }, [activeExtractionTask, autoMemoryState, setAutoMemoryState]);

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
    if (activeDreamTask && ActiveStatuses.has(activeDreamTask.status)) return;

    const success = activeDreamTask?.status === "completed";
    void vscodeHost.finishAutoMemoryDream({
      memoryDir: autoMemoryState.activeDreamMemoryDir,
      token: autoMemoryState.activeDreamToken,
      previousLastDreamAt: autoMemoryState.activeDreamPreviousLastDreamAt,
      success,
    });

    setAutoMemoryState({
      ...autoMemoryState,
      isDreaming: false,
      activeDreamTaskId: undefined,
      activeDreamToken: undefined,
      activeDreamMemoryDir: undefined,
      activeDreamPreviousLastDreamAt: undefined,
    });
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
      const nextState = {
        ...autoMemoryState,
        isExtracting: true,
        lastExtractionMessageCount: messageCount,
      };
      setAutoMemoryState?.(nextState);

      try {
        const config = await createForkAgent({
          store,
          label: "auto-memory",
          parentTaskId: taskId,
          parentMessages: messages,
          parentCwd,
          directive: prompts.autoMemory.buildExtractionDirective({
            context,
            previousMessageCount,
          }),
          tools: buildMemoryTools(context),
          setAsyncAgentState: async (asyncTaskId, state) => {
            const result = await vscodeHost.readAsyncAgentState(asyncTaskId);
            await result.setAsyncAgentState(state);
          },
        });

        setAutoMemoryState?.({
          ...nextState,
          activeExtractionTaskId: config.taskId,
        });
      } catch (error) {
        logger.warn("Failed to create long-term memory extraction task", error);
        setAutoMemoryState?.({
          ...nextState,
          isExtracting: false,
          activeExtractionTaskId: undefined,
        });
      }
    },
    [autoMemoryState, parentCwd, setAutoMemoryState, store, taskId],
  );

  const collectSameRepoTasks = useCallback(
    async ({
      context,
      currentCwd,
    }: {
      context: AutoMemoryContext;
      currentCwd: string | undefined;
    }): Promise<HistoryTask[]> => {
      const tasksSignal = threadSignal(await vscodeHost.readTasks());
      const tasks = Object.values(tasksSignal.value) as HistoryTask[];
      const result: HistoryTask[] = [];

      for (const task of tasks) {
        if (!task.id || task.parentId) continue;
        if (task.runAsync === true || task.runAsync === 1) continue;
        if (!task.cwd && !currentCwd) continue;

        const taskMemory = await vscodeHost.readAutoMemory({
          cwd: task.cwd ?? currentCwd,
          ensure: false,
        });
        if (taskMemory?.repoKey === context.repoKey) {
          result.push(task);
        }
      }

      return result;
    },
    [],
  );

  const collectDreamSessions = useCallback(
    async ({
      candidates,
      currentTaskId,
    }: {
      candidates: HistoryTask[];
      currentTaskId: string;
    }): Promise<AutoMemoryDreamSession[]> => {
      const sessions: AutoMemoryDreamSession[] = [];
      let totalChars = 0;

      for (const task of candidates.sort(
        (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
      )) {
        const taskStore =
          task.id === currentTaskId
            ? store
            : await getOrLoadTaskStore({
                storeRegistry,
                storeId: encodeStoreId(jwt, task.id),
                jwt,
              });
        const rows = taskStore.query(
          catalog.queries.makeMessagesQuery(task.id),
        );
        const transcript = serializeSessionTranscript(
          rows.map((row) => row.data as Message),
        );
        if (!transcript) continue;

        totalChars += transcript.length;
        if (totalChars > MaxDreamTranscriptChars) break;

        sessions.push({
          taskId: task.id,
          updatedAt: task.updatedAt ?? Date.now(),
          cwd: task.cwd,
          transcript,
        });
      }

      return sessions;
    },
    [jwt, store, storeRegistry],
  );

  const maybeStartDream = useCallback(
    async (context: AutoMemoryContext) => {
      if (autoMemoryState.isDreaming) return;

      const candidates = await collectSameRepoTasks({
        context,
        currentCwd: parentCwd,
      });
      const run = await vscodeHost.beginAutoMemoryDream({
        cwd: parentCwd,
        sessionUpdatedAts: candidates.map((task) => task.updatedAt ?? 0),
      });
      if (!run) return;

      const sessions = await collectDreamSessions({
        candidates: candidates.filter(
          (task) => (task.updatedAt ?? 0) > run.previousLastDreamAt,
        ),
        currentTaskId: taskId,
      });

      if (sessions.length === 0) {
        await vscodeHost.finishAutoMemoryDream({
          memoryDir: run.context.memoryDir,
          token: run.token,
          previousLastDreamAt: run.previousLastDreamAt,
          success: true,
        });
        return;
      }

      try {
        const config = await createForkAgent({
          store,
          label: "auto-memory-dream",
          parentTaskId: taskId,
          parentMessages: [],
          parentCwd,
          directive: prompts.autoMemory.buildDreamDirective({
            context: run.context,
            sessions,
          }),
          tools: buildMemoryTools(run.context),
          setAsyncAgentState: async (asyncTaskId, state) => {
            const result = await vscodeHost.readAsyncAgentState(asyncTaskId);
            await result.setAsyncAgentState(state);
          },
        });

        setAutoMemoryState?.({
          ...autoMemoryState,
          isDreaming: true,
          activeDreamTaskId: config.taskId,
          activeDreamToken: run.token,
          activeDreamMemoryDir: run.context.memoryDir,
          activeDreamPreviousLastDreamAt: run.previousLastDreamAt,
        });
      } catch (error) {
        logger.warn("Failed to create long-term memory dream task", error);
        await vscodeHost.finishAutoMemoryDream({
          memoryDir: run.context.memoryDir,
          token: run.token,
          previousLastDreamAt: run.previousLastDreamAt,
          success: false,
        });
      }
    },
    [
      collectDreamSessions,
      collectSameRepoTasks,
      autoMemoryState,
      parentCwd,
      setAutoMemoryState,
      store,
      taskId,
    ],
  );

  const tryUpdateAutoMemory = useCallback(
    (data: StreamFinishData) => {
      if (isSubTask || !setAutoMemoryState) return false;
      if (data.status && data.status !== "completed") return false;

      void (async () => {
        const context = await vscodeHost.readAutoMemory({ cwd: parentCwd });
        if (!context) return;

        const lastExtractionMessageCount =
          autoMemoryState.lastExtractionMessageCount;
        const messageCount = data.messages.length;
        let extractionStarted = false;

        if (
          !autoMemoryState.isExtracting &&
          messageCount > lastExtractionMessageCount
        ) {
          if (
            didConversationWriteMemory(
              data.messages.slice(lastExtractionMessageCount),
              context.memoryDir,
            )
          ) {
            setAutoMemoryState({
              ...autoMemoryState,
              lastExtractionMessageCount: messageCount,
            });
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
          await maybeStartDream(context);
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
    ],
  );

  return {
    tryUpdateAutoMemory,
  };
}

function buildMemoryTools(
  context: AutoMemoryContext,
): readonly ToolSpecInput[] {
  const memoryGlob = `${normalizeMemoryDir(context.memoryDir)}/**`;
  const tools: ToolSpecInput[] = [];
  for (const name of MemoryReadToolNames) {
    tools.push(`${name}(${memoryGlob})`);
  }
  for (const name of MemoryWriteToolNames) {
    tools.push(`${name}(${memoryGlob})`);
  }
  return tools;
}

function normalizeMemoryDir(memoryDir: string): string {
  return memoryDir.replace(/\\/g, "/").replace(/\/+$/, "");
}

function didConversationWriteMemory(
  messages: readonly Message[],
  memoryDir: string,
): boolean {
  return messages.some((message) =>
    message.parts.some((part) => {
      const toolName = getToolName(part);
      if (!toolName || !MemoryWriteTools.has(toolName)) return false;
      const inputPath =
        "input" in part && isObject(part.input) ? part.input.path : undefined;
      return (
        typeof inputPath === "string" && isMemoryPath(inputPath, memoryDir)
      );
    }),
  );
}

function getToolName(part: Message["parts"][number]): string | undefined {
  return typeof part.type === "string" && part.type.startsWith("tool-")
    ? part.type.slice("tool-".length)
    : undefined;
}

function isMemoryPath(inputPath: string, memoryDir: string): boolean {
  const normalizedPath = inputPath.replace(/\\/g, "/");
  const normalizedMemoryDir = memoryDir.replace(/\\/g, "/").replace(/\/+$/, "");
  return (
    normalizedPath === normalizedMemoryDir ||
    normalizedPath.startsWith(`${normalizedMemoryDir}/`)
  );
}

function serializeSessionTranscript(messages: readonly Message[]): string {
  const chunks = messages.map((message, index) => {
    const parts = message.parts
      .map((part) => truncate(JSON.stringify(sanitizePart(part)), MaxPartChars))
      .join("\n");
    return `### ${index + 1}. ${message.role}\n${parts}`;
  });
  return truncate(chunks.join("\n\n"), MaxSessionTranscriptChars);
}

function sanitizePart(part: Message["parts"][number]) {
  if (part.type === "text") return part;
  if (part.type.startsWith("data-")) return { type: part.type };
  if (part.type.startsWith("tool-")) {
    return {
      type: part.type,
      state: "state" in part ? part.state : undefined,
      input: "input" in part ? part.input : undefined,
      output: "output" in part ? part.output : undefined,
    };
  }
  return { type: part.type };
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n[truncated]`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}
