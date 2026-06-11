import type { ToolSpecInput } from "@getpochi/tools";
import { type UIMessage, getStaticToolName, isStaticToolUIPart } from "ai";
import {
  type AutoMemoryContext,
  type AutoMemoryDreamSession,
  type AutoMemoryTaskState,
  prompts,
} from "../base";
import {
  type StartForkAgent,
  buildForkAgentInitTitle,
  createForkAgent,
} from "../fork-agent";

const ActiveStatuses = new Set(["pending-model", "pending-tool"]);
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

type SetAutoMemoryState = (state: AutoMemoryTaskState) => Promise<void> | void;

type AutoMemoryDreamRun = {
  context: AutoMemoryContext;
  token: string;
  previousLastDreamAt: number;
  candidates: ReadonlyArray<{
    taskId: string;
    cwd?: string | null;
    updatedAt: number;
    transcriptFilename: string;
  }>;
};

type FinishAutoMemoryDream = (options: {
  memoryDir: string;
  token: string;
  previousLastDreamAt: number;
  success: boolean;
}) => Promise<void> | void;

export async function startAutoMemoryExtraction<TMessage extends UIMessage>({
  state,
  setAutoMemoryState,
  startForkAgent,
  parentTaskId,
  parentCwd,
  parentTaskTitle,
  context,
  messages,
  previousMessageCount,
  messageCount,
}: {
  state: AutoMemoryTaskState;
  setAutoMemoryState: SetAutoMemoryState;
  startForkAgent: StartForkAgent<TMessage>;
  parentTaskId: string;
  parentCwd: string | undefined;
  parentTaskTitle?: string;
  context: AutoMemoryContext;
  messages: TMessage[];
  previousMessageCount: number;
  messageCount: number;
}) {
  const nextState = {
    ...state,
    isExtracting: true,
    pendingExtractionMessageCount: messageCount,
  };
  await setAutoMemoryState(nextState);

  try {
    const agent = createForkAgent({
      label: "auto-memory",
      initTitle: buildForkAgentInitTitle("auto-memory", parentTaskTitle),
      parentTaskId,
      parentMessages: messages,
      parentCwd,
      directive: prompts.autoMemory.buildExtractionDirective({
        context,
        previousMessageCount,
      }),
      tools: buildMemoryTools(context),
    });
    const handle = await startForkAgent(agent);

    await setAutoMemoryState({
      ...nextState,
      activeExtractionTaskId: handle.taskId,
    });
    return handle;
  } catch (error) {
    await setAutoMemoryState({
      ...nextState,
      isExtracting: false,
      activeExtractionTaskId: undefined,
      pendingExtractionMessageCount: undefined,
    });
    throw error;
  }
}

export async function startAutoMemoryDream<TMessage extends UIMessage>({
  state,
  setAutoMemoryState,
  startForkAgent,
  finishAutoMemoryDream,
  parentTaskId,
  parentCwd,
  parentTaskTitle,
  run,
}: {
  state: AutoMemoryTaskState;
  setAutoMemoryState: SetAutoMemoryState;
  startForkAgent: StartForkAgent<TMessage>;
  finishAutoMemoryDream: FinishAutoMemoryDream;
  parentTaskId: string;
  parentCwd: string | undefined;
  parentTaskTitle?: string;
  run: AutoMemoryDreamRun | undefined;
}) {
  if (!run || state.isDreaming || state.isExtracting) return false;

  const sessions: AutoMemoryDreamSession[] = run.candidates.map(
    (candidate) => ({
      taskId: candidate.taskId,
      updatedAt: candidate.updatedAt,
      cwd: candidate.cwd,
      transcriptFilename: candidate.transcriptFilename,
    }),
  );

  if (sessions.length === 0) {
    await finishAutoMemoryDream({
      memoryDir: run.context.memoryDir,
      token: run.token,
      previousLastDreamAt: run.previousLastDreamAt,
      success: true,
    });
    return false;
  }

  try {
    const agent = createForkAgent({
      label: "auto-memory-dream",
      initTitle: buildForkAgentInitTitle("auto-memory-dream", parentTaskTitle),
      parentTaskId,
      parentMessages: [],
      parentCwd,
      directive: prompts.autoMemory.buildDreamDirective({
        context: run.context,
        sessions,
      }),
      tools: buildMemoryTools(run.context),
    });
    const handle = await startForkAgent(agent);

    await setAutoMemoryState({
      ...state,
      isDreaming: true,
      activeDreamTaskId: handle.taskId,
      activeDreamToken: run.token,
      activeDreamMemoryDir: run.context.memoryDir,
      activeDreamPreviousLastDreamAt: run.previousLastDreamAt,
    });
    return true;
  } catch (error) {
    await finishAutoMemoryDream({
      memoryDir: run.context.memoryDir,
      token: run.token,
      previousLastDreamAt: run.previousLastDreamAt,
      success: false,
    });
    throw error;
  }
}

export function resolveAutoMemoryExtractionState({
  state,
  activeExtractionTask,
}: {
  state: AutoMemoryTaskState;
  activeExtractionTask: { status: string } | null | undefined;
}): { nextState: AutoMemoryTaskState; success: boolean } | undefined {
  if (!state.isExtracting || !state.activeExtractionTaskId) return undefined;
  if (activeExtractionTask && ActiveStatuses.has(activeExtractionTask.status)) {
    return undefined;
  }

  const success = activeExtractionTask?.status === "completed";
  return {
    success,
    nextState: {
      ...state,
      isExtracting: false,
      extractionCount: success
        ? state.extractionCount + 1
        : state.extractionCount,
      lastExtractionMessageCount: success
        ? (state.pendingExtractionMessageCount ??
          state.lastExtractionMessageCount)
        : state.lastExtractionMessageCount,
      pendingExtractionMessageCount: undefined,
      activeExtractionTaskId: undefined,
    },
  };
}

export function resolveAutoMemoryDreamState({
  state,
  activeDreamTask,
}: {
  state: AutoMemoryTaskState;
  activeDreamTask: { status: string } | null | undefined;
}):
  | {
      nextState: AutoMemoryTaskState;
      finish: Parameters<FinishAutoMemoryDream>[0];
    }
  | undefined {
  if (
    !state.isDreaming ||
    !state.activeDreamTaskId ||
    !state.activeDreamToken ||
    !state.activeDreamMemoryDir ||
    state.activeDreamPreviousLastDreamAt === undefined
  ) {
    return undefined;
  }

  if (activeDreamTask && ActiveStatuses.has(activeDreamTask.status)) {
    return undefined;
  }

  return {
    finish: {
      memoryDir: state.activeDreamMemoryDir,
      token: state.activeDreamToken,
      previousLastDreamAt: state.activeDreamPreviousLastDreamAt,
      success: activeDreamTask?.status === "completed",
    },
    nextState: {
      ...state,
      isDreaming: false,
      activeDreamTaskId: undefined,
      activeDreamToken: undefined,
      activeDreamMemoryDir: undefined,
      activeDreamPreviousLastDreamAt: undefined,
    },
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
    tools.push(`${name}(${transcriptGlob})`);
  }
  for (const name of MemoryWriteToolNames) {
    tools.push(`${name}(${memoryGlob})`);
  }
  return tools;
}

export function didConversationWriteMemory(
  messages: readonly UIMessage[],
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

export function serializeSessionTranscript(
  messages: readonly UIMessage[],
): string {
  const chunks = messages.map((message, index) => {
    const parts = message.parts
      .map((part) => truncate(JSON.stringify(sanitizePart(part)), MaxPartChars))
      .join("\n");
    return `### ${index + 1}. ${message.role}\n${parts}`;
  });
  return truncate(chunks.join("\n\n"), MaxSessionTranscriptChars);
}

function getToolName(part: UIMessage["parts"][number]): string | undefined {
  return isStaticToolUIPart(part) ? getStaticToolName(part) : undefined;
}

function isSuccessfulToolOutput(part: UIMessage["parts"][number]): boolean {
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

function normalizeDir(dir: string): string {
  return dir.replace(/\\/g, "/").replace(/\/+$/, "");
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

function sanitizePart(part: UIMessage["parts"][number]) {
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
