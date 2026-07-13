import {
  type AutoMemoryContext,
  type AutoMemoryDreamCandidate,
  type AutoMemoryDreamRun,
  type AutoMemoryDreamSession,
  type AutoMemoryManager,
  type AutoMemoryTaskState,
  getLogger,
  prompts,
} from "@getpochi/common";
import { type ToolSpecInput, ToolsByPermission } from "@getpochi/tools";
import { type UIMessage, getStaticToolName, isStaticToolUIPart } from "ai";
import { isPlainObject } from "remeda";
import { makeTaskQuery } from "../../livestore/default-queries";
import type { LiveKitStore, Message } from "../../types";
import {
  type StartForkAgent,
  buildForkAgentInitTitle,
  createForkAgent,
} from "../fork-agent";
import { type MemoryStateStore, createMemoryStateStore } from "../state-store";

export type { AutoMemoryManager } from "@getpochi/common";

const logger = getLogger("AutoMemory");
const ActiveStatuses = new Set(["pending-model", "pending-tool"]);
const MemoryReadToolNames = [
  "readFile",
  "listFiles",
  "globFiles",
  "searchFiles",
] as const;
const MemoryAgentWriteToolNames = ["writeToFile", "applyDiff"] as const;
const MaxSessionTranscriptChars = 24_000;
const MaxPartChars = 4_000;

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
  setAutoMemoryState: MemoryStateStore<AutoMemoryTaskState>["set"];
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
  setAutoMemoryState: MemoryStateStore<AutoMemoryTaskState>["set"];
  startForkAgent: StartForkAgent<TMessage>;
  finishAutoMemoryDream: AutoMemoryManager["finishDreamRun"];
  parentTaskId: string;
  parentCwd: string | undefined;
  parentTaskTitle?: string;
  run: AutoMemoryDreamRun;
}) {
  if (state.isDreaming || state.isExtracting) return false;

  const sessions: AutoMemoryDreamSession[] = run.candidates.map(
    (candidate) => ({
      taskId: candidate.taskId,
      updatedAt: candidate.updatedAt,
      cwd: candidate.cwd,
      transcriptFilename: candidate.transcriptFilename,
      title: candidate.title,
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
      finish: Parameters<AutoMemoryManager["finishDreamRun"]>[0];
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
  for (const name of MemoryAgentWriteToolNames) {
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
      if (!isStaticToolUIPart(part)) return false;
      if (!ToolsByPermission.write.includes(getStaticToolName(part))) {
        return false;
      }
      if (!isSuccessfulToolOutput(part)) return false;
      if (!isPlainObject(part.input) || typeof part.input.path !== "string") {
        return false;
      }
      return isMemoryPath(part.input.path, memoryDir, cwd);
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

function isSuccessfulToolOutput(part: UIMessage["parts"][number]): boolean {
  if (!("state" in part) || part.state !== "output-available") return false;
  const output = "output" in part ? part.output : undefined;
  return (
    isPlainObject(output) && output.success === true && !("error" in output)
  );
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
    waitForTaskDone?: (taskId: string) => Promise<void>;
  };
  autoMemoryStateStore?: MemoryStateStore<AutoMemoryTaskState>;
  parentTaskId: string;
  parentCwd: string | undefined | (() => string | undefined);
  isSubTask?: boolean;
  manager: AutoMemoryManager;
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
      // Extraction keeps running even when Project Memory injection is
      // disabled, so bypass the enabled preference when reading context.
      const context = await this.options.manager.readContext({
        cwd: parentCwd,
        force: true,
      });
      if (!context) return false;

      const state = this.getState();
      const messageCount = data.messages.length;
      const updatedAt = Date.now();
      const transcript = serializeSessionTranscript(data.messages);
      const transcriptInfo = transcript
        ? await this.options.manager.writeTaskTranscript({
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
            title: task.title ?? undefined,
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
          await this.stateStore.set(nextState);
          return this.maybeStartDream(nextState);
        }

        const handle = await startAutoMemoryExtraction({
          state,
          setAutoMemoryState: (nextState) => this.stateStore.set(nextState),
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
        await this.stateStore.set(extractionResolution.nextState);
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
        await this.options.manager.finishDreamRun(dreamResolution.finish);
        await this.stateStore.set(dreamResolution.nextState);
      }
    } catch (error) {
      logger.warn("Failed to settle long-term memory update", error);
    }

    return false;
  }

  private async maybeStartDream(baseState = this.getState()): Promise<boolean> {
    if (baseState.isDreaming || baseState.isExtracting) return false;

    const parentCwd = this.getParentCwd();
    const run = await this.options.manager.beginDreamRun({
      cwd: parentCwd,
      sessionUpdatedAts: this.currentTranscript
        ? [this.currentTranscript.updatedAt]
        : [],
      currentTranscript: this.currentTranscript,
    });
    if (!run) return false;

    const task = this.options.store.query(
      makeTaskQuery(this.options.parentTaskId),
    );
    const started = await startAutoMemoryDream<Message>({
      state: baseState,
      setAutoMemoryState: (nextState) => this.stateStore.set(nextState),
      startForkAgent: (agent) =>
        this.options.backgroundTask.startForkAgent(agent),
      finishAutoMemoryDream: (finishOptions) =>
        this.options.manager.finishDreamRun(finishOptions),
      parentTaskId: this.options.parentTaskId,
      parentCwd,
      parentTaskTitle: task?.title ?? undefined,
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

    void waitForTaskDone(taskId)
      .then(() => this.settleAndMaybeContinue())
      .catch((error) => {
        logger.warn(`Failed to settle ${label}`, error);
      });
  }

  private getParentCwd() {
    const { parentCwd } = this.options;
    return typeof parentCwd === "function" ? parentCwd() : parentCwd;
  }
}
