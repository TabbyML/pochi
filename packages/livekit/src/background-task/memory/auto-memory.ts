import {
  type AutoMemoryContext,
  type AutoMemoryDreamSession,
  type AutoMemoryTaskState,
  getLogger,
  prompts,
} from "@getpochi/common";
import type { ToolSpecInput } from "@getpochi/tools";
import { type UIMessage, getStaticToolName, isStaticToolUIPart } from "ai";
import { makeTaskQuery } from "../../livestore/default-queries";
import type { LiveKitStore, Message } from "../../types";
import {
  type StartForkAgent,
  buildForkAgentInitTitle,
  createForkAgent,
} from "../fork-agent";
import {
  type MaybePromise,
  type MemoryStateStore,
  createMemoryStateStore,
} from "../state-store";

const logger = getLogger("AutoMemory");
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

type AutoMemoryTranscriptInfo = {
  transcriptDir: string;
  filename: string;
};

type AutoMemoryDreamCandidate = {
  taskId: string;
  cwd?: string | null;
  updatedAt: number;
  transcriptFilename: string;
};

type AutoMemoryDreamRun = {
  context: AutoMemoryContext;
  token: string;
  previousLastDreamAt: number;
  candidates: ReadonlyArray<AutoMemoryDreamCandidate>;
};

type FinishAutoMemoryDream = (options: {
  memoryDir: string;
  token: string;
  previousLastDreamAt: number;
  success: boolean;
}) => Promise<void> | void;

export type AutoMemoryBackend = {
  readContext(
    cwd: string | undefined,
  ): MaybePromise<AutoMemoryContext | undefined>;
  writeTaskTranscript(options: {
    taskId: string;
    cwd: string | undefined;
    title?: string;
    updatedAt?: number;
    transcript: string;
  }): MaybePromise<AutoMemoryTranscriptInfo | undefined>;
  beginDreamRun(options: {
    cwd: string | undefined;
    sessionUpdatedAts: readonly number[];
    currentTranscript?: AutoMemoryDreamCandidate;
  }): MaybePromise<AutoMemoryDreamRun | undefined>;
  finishDreamRun(options: {
    memoryDir: string;
    token: string;
    previousLastDreamAt: number;
    success: boolean;
  }): MaybePromise<void>;
};

async function startAutoMemoryExtraction<TMessage extends UIMessage>({
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

async function startAutoMemoryDream<TMessage extends UIMessage>({
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

function resolveAutoMemoryExtractionState({
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

function resolveAutoMemoryDreamState({
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

function didConversationWriteMemory(
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

function serializeSessionTranscript(messages: readonly UIMessage[]): string {
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

const DefaultAutoMemoryState: AutoMemoryTaskState = {
  lastExtractionMessageCount: 0,
  isExtracting: false,
  extractionCount: 0,
  isDreaming: false,
};

type AutoMemoryAdaptorOptions = {
  store: LiveKitStore;
  backgroundTask: {
    startForkAgent: StartForkAgent<Message>;
    waitForTaskDone?: (taskId: string) => MaybePromise<void>;
  };
  autoMemoryStateStore?: MemoryStateStore<AutoMemoryTaskState>;
  parentTaskId: string;
  parentCwd: string | undefined | (() => string | undefined);
  isSubTask?: boolean;
  backend: AutoMemoryBackend;
};

export class AutoMemoryAdaptor {
  private readonly stateStore: MemoryStateStore<AutoMemoryTaskState>;
  private currentTranscript: AutoMemoryDreamCandidate | undefined;

  constructor(private readonly options: AutoMemoryAdaptorOptions) {
    this.stateStore =
      options.autoMemoryStateStore ??
      createMemoryStateStore<AutoMemoryTaskState>({
        ...DefaultAutoMemoryState,
      });
  }

  getState() {
    return this.stateStore.get() ?? { ...DefaultAutoMemoryState };
  }

  async update(data: { messages: Message[]; status?: string }) {
    if (this.options.isSubTask) return false;
    if (data.status && data.status !== "completed") return false;

    const task = this.options.store.query(
      makeTaskQuery(this.options.parentTaskId),
    );
    if (!task || task.status !== "completed") return false;

    try {
      const parentCwd = this.getParentCwd();
      const context = await this.options.backend.readContext(parentCwd);
      if (!context) return false;

      const state = this.getState();
      const messageCount = data.messages.length;
      const updatedAt = Date.now();
      const transcript = serializeSessionTranscript(data.messages);
      const transcriptInfo = transcript
        ? await this.options.backend.writeTaskTranscript({
            taskId: this.options.parentTaskId,
            cwd: parentCwd,
            title: task.title ?? undefined,
            updatedAt,
            transcript,
          })
        : undefined;

      this.currentTranscript = transcriptInfo
        ? {
            taskId: this.options.parentTaskId,
            cwd: parentCwd,
            updatedAt,
            transcriptFilename: transcriptInfo.filename,
          }
        : undefined;

      if (
        !state.isExtracting &&
        messageCount > state.lastExtractionMessageCount
      ) {
        if (
          didConversationWriteMemory(
            data.messages.slice(state.lastExtractionMessageCount),
            context.memoryDir,
            parentCwd,
          )
        ) {
          const nextState = {
            ...state,
            lastExtractionMessageCount: messageCount,
          };
          await this.setAutoMemoryState(nextState);
          return this.maybeStartDream(nextState);
        }

        const handle = await startAutoMemoryExtraction({
          state,
          setAutoMemoryState: (nextState) => this.setAutoMemoryState(nextState),
          startForkAgent: (agent) =>
            this.options.backgroundTask.startForkAgent(agent),
          parentTaskId: this.options.parentTaskId,
          parentCwd,
          parentTaskTitle: task.title ?? undefined,
          context,
          messages: data.messages,
          previousMessageCount: state.lastExtractionMessageCount,
          messageCount,
        });
        this.watchTaskDone(handle.taskId, "auto-memory extraction");
        return true;
      }

      return this.maybeStartDream(state);
    } catch (error) {
      logger.warn("Failed to start long-term memory update", error);
      return false;
    }
  }

  async settleAndMaybeContinue() {
    if (this.options.isSubTask) return false;

    try {
      const state = this.getState();
      const extractionResolution = resolveAutoMemoryExtractionState({
        state,
        activeExtractionTask: state.activeExtractionTaskId
          ? this.options.store.query(
              makeTaskQuery(state.activeExtractionTaskId),
            )
          : undefined,
      });
      if (extractionResolution) {
        await this.setAutoMemoryState(extractionResolution.nextState);
        if (
          extractionResolution.success &&
          (await this.maybeStartDream(extractionResolution.nextState))
        ) {
          return true;
        }
      }

      const nextState = this.getState();
      const dreamResolution = resolveAutoMemoryDreamState({
        state: nextState,
        activeDreamTask: nextState.activeDreamTaskId
          ? this.options.store.query(makeTaskQuery(nextState.activeDreamTaskId))
          : undefined,
      });
      if (dreamResolution) {
        await this.options.backend.finishDreamRun(dreamResolution.finish);
        await this.setAutoMemoryState(dreamResolution.nextState);
      }
    } catch (error) {
      logger.warn("Failed to settle long-term memory update", error);
    }

    return false;
  }

  private async maybeStartDream(baseState = this.getState()): Promise<boolean> {
    if (baseState.isDreaming || baseState.isExtracting) return false;

    const parentCwd = this.getParentCwd();
    const run = await this.options.backend.beginDreamRun({
      cwd: parentCwd,
      sessionUpdatedAts: this.currentTranscript
        ? [this.currentTranscript.updatedAt]
        : [],
      currentTranscript: this.currentTranscript,
    });
    if (!run) return false;

    const started = await startAutoMemoryDream<Message>({
      state: baseState,
      setAutoMemoryState: (nextState) => this.setAutoMemoryState(nextState),
      startForkAgent: (agent) =>
        this.options.backgroundTask.startForkAgent(agent),
      finishAutoMemoryDream: (finishOptions) =>
        this.options.backend.finishDreamRun(finishOptions),
      parentTaskId: this.options.parentTaskId,
      parentCwd,
      parentTaskTitle: this.getParentTaskTitle(),
      run,
    });
    if (started) {
      this.watchTaskDone(
        this.getState().activeDreamTaskId,
        "auto-memory dream",
      );
    }
    return started;
  }

  private watchTaskDone(taskId: string | undefined, label: string) {
    const { waitForTaskDone } = this.options.backgroundTask;
    if (!taskId || !waitForTaskDone) return;

    void Promise.resolve(waitForTaskDone(taskId))
      .then(() => this.settleAndMaybeContinue())
      .catch((error) => {
        logger.warn(`Failed to settle ${label}`, error);
      });
  }

  private getParentTaskTitle() {
    const task = this.options.store.query(
      makeTaskQuery(this.options.parentTaskId),
    );
    return task?.title ?? undefined;
  }

  private setAutoMemoryState(nextState: AutoMemoryTaskState) {
    return this.stateStore.set(nextState);
  }

  private getParentCwd() {
    const { parentCwd } = this.options;
    return typeof parentCwd === "function" ? parentCwd() : parentCwd;
  }
}
