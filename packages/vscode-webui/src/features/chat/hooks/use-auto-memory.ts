import { useAutoMemoryState } from "@/lib/hooks/use-auto-memory-state";
import { useDefaultStore } from "@/lib/use-default-store";
import { vscodeHost } from "@/lib/vscode";
import {
  type AutoMemoryContext,
  type AutoMemoryDreamSession,
  getLogger,
  prompts,
} from "@getpochi/common";
import { type Message, catalog } from "@getpochi/livekit";
import type { ToolSpecInput } from "@getpochi/tools";
import { getStaticToolName, isStaticToolUIPart } from "ai";
import { useCallback, useEffect } from "react";
import {
  buildForkAgentInitTitle,
  createForkAgent,
} from "../lib/create-fork-agent";

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
const MaxSessionTranscriptChars = 24_000;
const MaxPartChars = 4_000;

type StreamFinishData = {
  messages: Message[];
  status?: string;
};

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

  const maybeStartDream = useCallback(
    async (baseState = autoMemoryState) => {
      if (!setAutoMemoryState || baseState.isDreaming || baseState.isExtracting)
        return;

      const run = await vscodeHost.beginAutoMemoryDream({ cwd: parentCwd });
      if (!run) return;

      const sessions: AutoMemoryDreamSession[] = run.candidates.map(
        (candidate) => ({
          taskId: candidate.taskId,
          updatedAt: candidate.updatedAt,
          cwd: candidate.cwd,
          transcriptFilename: candidate.transcriptFilename,
        }),
      );

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
        const parentTask = store.query(catalog.queries.makeTaskQuery(taskId));
        const config = await createForkAgent({
          store,
          label: "auto-memory-dream",
          initTitle: buildForkAgentInitTitle(
            "auto-memory-dream",
            parentTask?.title ?? undefined,
          ),
          parentTaskId: taskId,
          parentMessages: [],
          parentCwd,
          directive: prompts.autoMemory.buildDreamDirective({
            context: run.context,
            sessions,
          }),
          tools: buildMemoryTools(run.context),
          setBackgroundTaskState: async (backgroundTaskId, state) => {
            const result =
              await vscodeHost.readBackgroundTaskState(backgroundTaskId);
            await result.setBackgroundTaskState(state);
          },
        });

        setAutoMemoryState({
          ...baseState,
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
    [autoMemoryState, parentCwd, setAutoMemoryState, store, taskId],
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

    const success = activeExtractionTask?.status === "completed";
    const nextState = {
      ...autoMemoryState,
      isExtracting: false,
      extractionCount: success
        ? autoMemoryState.extractionCount + 1
        : autoMemoryState.extractionCount,
      lastExtractionMessageCount: success
        ? (autoMemoryState.pendingExtractionMessageCount ??
          autoMemoryState.lastExtractionMessageCount)
        : autoMemoryState.lastExtractionMessageCount,
      pendingExtractionMessageCount: undefined,
      activeExtractionTaskId: undefined,
    };

    setAutoMemoryState(nextState);
    if (success) {
      void maybeStartDream(nextState);
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
        pendingExtractionMessageCount: messageCount,
      };
      setAutoMemoryState?.(nextState);

      try {
        const parentTask = store.query(catalog.queries.makeTaskQuery(taskId));
        const config = await createForkAgent({
          store,
          label: "auto-memory",
          initTitle: buildForkAgentInitTitle(
            "auto-memory",
            parentTask?.title ?? undefined,
          ),
          parentTaskId: taskId,
          parentMessages: messages,
          parentCwd,
          directive: prompts.autoMemory.buildExtractionDirective({
            context,
            previousMessageCount,
          }),
          tools: buildMemoryTools(context),
          setBackgroundTaskState: async (backgroundTaskId, state) => {
            const result =
              await vscodeHost.readBackgroundTaskState(backgroundTaskId);
            await result.setBackgroundTaskState(state);
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
          pendingExtractionMessageCount: undefined,
        });
      }
    },
    [autoMemoryState, parentCwd, setAutoMemoryState, store, taskId],
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
    (data: StreamFinishData) => {
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

function buildMemoryTools(
  context: AutoMemoryContext,
): readonly ToolSpecInput[] {
  const memoryGlob = `${normalizeDir(context.memoryDir)}/**`;
  const transcriptGlob = `${normalizeDir(context.transcriptDir)}/**`;
  const tools: ToolSpecInput[] = [];
  for (const name of MemoryReadToolNames) {
    tools.push(`${name}(${memoryGlob})`);
    // Read-only access to transcripts — write tools are intentionally not
    // granted; transcripts are derived data owned by the producing panel.
    tools.push(`${name}(${transcriptGlob})`);
  }
  for (const name of MemoryWriteToolNames) {
    tools.push(`${name}(${memoryGlob})`);
  }
  return tools;
}

function normalizeDir(dir: string): string {
  return dir.replace(/\\/g, "/").replace(/\/+$/, "");
}

function didConversationWriteMemory(
  messages: readonly Message[],
  memoryDir: string,
  cwd?: string,
): boolean {
  return messages.some((message) =>
    message.parts.some((part) => {
      const toolName = getToolName(part);
      if (!toolName || !MemoryWriteTools.has(toolName)) return false;
      if (!isSuccessfulToolOutput(part)) return false;

      const inputPath =
        "input" in part && isObject(part.input) ? part.input.path : undefined;
      return (
        typeof inputPath === "string" && isMemoryPath(inputPath, memoryDir, cwd)
      );
    }),
  );
}

function getToolName(part: Message["parts"][number]): string | undefined {
  return isStaticToolUIPart(part) ? getStaticToolName(part) : undefined;
}

function isSuccessfulToolOutput(part: Message["parts"][number]): boolean {
  if (!("state" in part) || part.state !== "output-available") return false;
  const output = "output" in part ? part.output : undefined;
  return isObject(output) && output.success === true && !("error" in output);
}

function isMemoryPath(
  inputPath: string,
  memoryDir: string,
  cwd?: string,
): boolean {
  const normalizedPath = normalizeFsPath(inputPath, cwd);
  const normalizedMemoryDir = normalizeFsPath(memoryDir).replace(/\/+$/, "");
  const [pathForMatch, memoryDirForMatch] =
    isWindowsAbsolutePath(normalizedPath) ||
    isWindowsAbsolutePath(normalizedMemoryDir)
      ? [normalizedPath.toLowerCase(), normalizedMemoryDir.toLowerCase()]
      : [normalizedPath, normalizedMemoryDir];
  return (
    pathForMatch === memoryDirForMatch ||
    pathForMatch.startsWith(`${memoryDirForMatch}/`)
  );
}

function normalizeFsPath(inputPath: string, cwd?: string): string {
  const normalizedInput = inputPath.replace(/\\/g, "/");
  const absoluteInput =
    isAbsoluteFsPath(normalizedInput) || !cwd
      ? normalizedInput
      : `${cwd.replace(/\\/g, "/").replace(/\/+$/, "")}/${normalizedInput}`;
  return normalizePathSegments(absoluteInput);
}

function normalizePathSegments(inputPath: string): string {
  const { root, rest } = splitPathRoot(inputPath);
  const segments: string[] = [];

  for (const segment of rest.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length > 0) {
        segments.pop();
      } else if (!root) {
        segments.push(segment);
      }
      continue;
    }
    segments.push(segment);
  }

  const pathWithoutTrailingSlash = `${root}${segments.join("/")}`;
  return pathWithoutTrailingSlash || root || ".";
}

function splitPathRoot(inputPath: string): { root: string; rest: string } {
  const normalizedPath = inputPath.replace(/\\/g, "/");
  const driveRoot = normalizedPath.match(/^[A-Za-z]:\//);
  if (driveRoot) {
    return {
      root: driveRoot[0],
      rest: normalizedPath.slice(driveRoot[0].length),
    };
  }
  if (normalizedPath.startsWith("/")) {
    return { root: "/", rest: normalizedPath.slice(1) };
  }
  return { root: "", rest: normalizedPath };
}

function isAbsoluteFsPath(inputPath: string): boolean {
  return inputPath.startsWith("/") || isWindowsAbsolutePath(inputPath);
}

function isWindowsAbsolutePath(inputPath: string): boolean {
  return /^[A-Za-z]:\//.test(inputPath.replace(/\\/g, "/"));
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
  if (isStaticToolUIPart(part)) {
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
