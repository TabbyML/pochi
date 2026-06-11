import {
  type AutoMemoryTaskState,
  type BackgroundTaskState,
  type ContextWindowUsage,
  type TaskMemoryState,
  getLogger,
} from "@getpochi/common";
import {
  didConversationWriteMemory,
  resolveAutoMemoryDreamState,
  resolveAutoMemoryExtractionState,
  serializeSessionTranscript,
  startAutoMemoryDream,
  startAutoMemoryExtraction,
} from "@getpochi/common/auto-memory";
import { AutoMemoryManager } from "@getpochi/common/auto-memory/node";
import type {
  ForkAgent,
  ForkAgentHandle,
  StartForkAgent,
} from "@getpochi/common/fork-agent";
import type { McpHub } from "@getpochi/common/mcp-utils";
import {
  DefaultTaskMemoryState,
  TaskMemoryStoreFilePath,
  getExtractionMetrics,
  resolveTaskMemoryExtractionState,
  shouldExtractTaskMemory,
  startTaskMemoryExtraction,
} from "@getpochi/common/task-memory";
import {
  FileStateCache,
  maybePersistToolResult,
} from "@getpochi/common/tool-utils";
import { resolveToolCallArgs } from "@getpochi/common/vscode-webui-bridge";
import {
  type BlobStore,
  type LLMRequestData,
  type LiveKitStore,
  type Message,
  type UITools,
  catalog,
  processContentOutput,
} from "@getpochi/livekit";
import {
  type BackgroundTaskRuntimeAdapter,
  type BackgroundTaskRuntimeContext,
  type BackgroundTaskToolCallExecution,
  createBackgroundTaskRunner as createLiveKitBackgroundTaskRunner,
} from "@getpochi/livekit/background";
import type { CustomAgent, Skill } from "@getpochi/tools";
import type { ToolUIPart } from "ai";
import { BackgroundJobManager } from "./lib/background-job-manager";
import type { FileSystem } from "./lib/file-system";
import { readEnvironment } from "./lib/read-environment";
import { executeToolCall } from "./tools";
import type { ToolCallOptions } from "./types";

const logger = getLogger("BackgroundTaskRunner");

export class BackgroundTaskStateStore {
  private readonly states = new Map<string, BackgroundTaskState>();

  read(taskId: string) {
    return this.states.get(taskId);
  }

  set(taskId: string, state: BackgroundTaskState) {
    this.states.set(taskId, state);
  }
}

export interface BackgroundTaskRunnerOptions {
  store: LiveKitStore;
  blobStore: BlobStore;
  llm: LLMRequestData;
  cwd: string;
  rg: string;
  filesystem: FileSystem;
  customAgents?: CustomAgent[];
  skills?: Skill[];
  mcpHub?: McpHub;
  parentTaskId?: string;
  parentFileStateCache?: FileStateCache;
  stateStore?: BackgroundTaskStateStore;
  autoMemoryManager?: AutoMemoryManager;
}

export function createBackgroundTaskRunner(
  options: BackgroundTaskRunnerOptions,
) {
  const stateStore = options.stateStore ?? new BackgroundTaskStateStore();
  const adapter = new BackgroundTaskAdapter({
    ...options,
    stateStore,
  });
  const runner = createLiveKitBackgroundTaskRunner({
    store: options.store,
    blobStore: options.blobStore,
    adapter,
  });

  return {
    runner,
    stateStore,
    drain: () => runner.drain(),
    stop: async () => {
      await runner.stop();
      adapter.dispose();
    },
  };
}

export function createTaskMemoryCoordinator(options: {
  store: LiveKitStore;
  stateStore: BackgroundTaskStateStore;
  parentTaskId: string;
  parentCwd: string | undefined;
  isSubTask?: boolean;
}) {
  let state: TaskMemoryState = { ...DefaultTaskMemoryState };
  const setTaskMemoryState = (nextState: TaskMemoryState) => {
    state = nextState;
  };
  const startTaskMemoryForkAgent: StartForkAgent<Message> = (agent) =>
    createBackgroundTaskFromForkAgent({
      store: options.store,
      stateStore: options.stateStore,
      agent,
    });

  const settle = () => {
    if (!state.activeTaskId || !state.isExtracting) return false;

    const nextState = resolveTaskMemoryExtractionState({
      state,
      activeTask: options.store.query(
        catalog.queries.makeTaskQuery(state.activeTaskId),
      ),
      activeMessages: options.store
        .query(catalog.queries.makeMessagesQuery(state.activeTaskId))
        .map((row) => row.data as Message),
    });
    if (!nextState) return false;

    state = nextState;
    return true;
  };

  return {
    async update(data: {
      messages: Message[];
      contextWindowUsage?: ContextWindowUsage;
    }) {
      if (options.isSubTask) return false;
      settle();

      const task = options.store.query(
        catalog.queries.makeTaskQuery(options.parentTaskId),
      );
      if (!task) return false;

      const metrics = getExtractionMetrics(data);
      if (!shouldExtractTaskMemory(state, metrics)) {
        return false;
      }

      try {
        const memoryFile = options.store.query(
          catalog.queries.makeStoreFileQuery(TaskMemoryStoreFilePath),
        );
        await startTaskMemoryExtraction({
          state,
          metrics,
          setTaskMemoryState,
          startForkAgent: startTaskMemoryForkAgent,
          parentTaskId: options.parentTaskId,
          parentMessages: data.messages,
          parentCwd: options.parentCwd,
          parentTaskTitle: task.title ?? undefined,
          existingMemory: memoryFile?.content ?? undefined,
        });
        return true;
      } catch (error) {
        logger.warn("Failed to start task-memory extraction", error);
        return false;
      }
    },

    settle,
  };
}

const DefaultAutoMemoryState: AutoMemoryTaskState = {
  lastExtractionMessageCount: 0,
  isExtracting: false,
  extractionCount: 0,
  isDreaming: false,
};

export function createAutoMemoryCoordinator(options: {
  store: LiveKitStore;
  stateStore: BackgroundTaskStateStore;
  parentTaskId: string;
  parentCwd: string | undefined;
  isSubTask?: boolean;
  manager?: AutoMemoryManager;
}) {
  const manager = options.manager ?? new AutoMemoryManager();
  let state: AutoMemoryTaskState = { ...DefaultAutoMemoryState };
  let transcriptFilename: string | undefined;
  let transcriptUpdatedAt: number | undefined;

  const setAutoMemoryState = (nextState: AutoMemoryTaskState) => {
    state = nextState;
  };
  const startMemoryForkAgent: StartForkAgent<Message> = (agent) =>
    createBackgroundTaskFromForkAgent({
      store: options.store,
      stateStore: options.stateStore,
      agent,
    });
  const getParentTaskTitle = () => {
    const task = options.store.query(
      catalog.queries.makeTaskQuery(options.parentTaskId),
    );
    return task?.title ?? undefined;
  };

  const maybeStartDream = async (baseState = state): Promise<boolean> => {
    if (baseState.isDreaming || baseState.isExtracting) return false;

    const run = await manager.beginDreamRun({
      cwd: options.parentCwd,
      sessionUpdatedAts: transcriptUpdatedAt ? [transcriptUpdatedAt] : [],
    });
    if (!run) return false;

    const candidates =
      transcriptFilename &&
      transcriptUpdatedAt &&
      transcriptUpdatedAt > run.previousLastDreamAt
        ? [
            {
              taskId: options.parentTaskId,
              cwd: options.parentCwd,
              updatedAt: transcriptUpdatedAt,
              transcriptFilename,
            },
          ]
        : [];

    return startAutoMemoryDream({
      state: baseState,
      setAutoMemoryState,
      startForkAgent: startMemoryForkAgent,
      finishAutoMemoryDream: (finishOptions) =>
        manager.finishDreamRun(finishOptions),
      parentTaskId: options.parentTaskId,
      parentCwd: options.parentCwd,
      parentTaskTitle: getParentTaskTitle(),
      run: {
        context: run.context,
        token: run.token,
        previousLastDreamAt: run.previousLastDreamAt,
        candidates,
      },
    });
  };

  return {
    async update(data: { messages: Message[]; status?: string }) {
      if (options.isSubTask) return false;
      if (data.status && data.status !== "completed") return false;

      const task = options.store.query(
        catalog.queries.makeTaskQuery(options.parentTaskId),
      );
      if (!task || task.status !== "completed") return false;

      try {
        const context = await manager.readContext(options.parentCwd);
        if (!context) return false;

        const messageCount = data.messages.length;
        const updatedAt = Date.now();
        const transcript = serializeSessionTranscript(data.messages);
        const transcriptInfo = transcript
          ? await manager.writeTaskTranscript({
              taskId: options.parentTaskId,
              cwd: options.parentCwd,
              title: task.title ?? undefined,
              updatedAt,
              transcript,
            })
          : undefined;

        transcriptFilename = transcriptInfo?.filename;
        transcriptUpdatedAt = updatedAt;

        if (messageCount > state.lastExtractionMessageCount) {
          if (
            didConversationWriteMemory(
              data.messages.slice(state.lastExtractionMessageCount),
              context.memoryDir,
              options.parentCwd,
            )
          ) {
            state = {
              ...state,
              lastExtractionMessageCount: messageCount,
            };
          } else {
            await startAutoMemoryExtraction({
              state,
              setAutoMemoryState,
              startForkAgent: startMemoryForkAgent,
              parentTaskId: options.parentTaskId,
              parentCwd: options.parentCwd,
              parentTaskTitle: task.title ?? undefined,
              context,
              messages: data.messages,
              previousMessageCount: state.lastExtractionMessageCount,
              messageCount,
            });
            return true;
          }
        }

        return maybeStartDream(state);
      } catch (error) {
        logger.warn("Failed to start long-term memory update", error);
        return false;
      }
    },

    async settleAndMaybeContinue() {
      if (options.isSubTask) return false;

      try {
        const extractionResolution = resolveAutoMemoryExtractionState({
          state,
          activeExtractionTask: state.activeExtractionTaskId
            ? options.store.query(
                catalog.queries.makeTaskQuery(state.activeExtractionTaskId),
              )
            : undefined,
        });
        if (extractionResolution) {
          state = extractionResolution.nextState;
          if (extractionResolution.success && (await maybeStartDream(state))) {
            return true;
          }
        }

        const dreamResolution = resolveAutoMemoryDreamState({
          state,
          activeDreamTask: state.activeDreamTaskId
            ? options.store.query(
                catalog.queries.makeTaskQuery(state.activeDreamTaskId),
              )
            : undefined,
        });
        if (dreamResolution) {
          await manager.finishDreamRun(dreamResolution.finish);
          state = dreamResolution.nextState;
        }
      } catch (error) {
        logger.warn("Failed to settle long-term memory update", error);
      }

      return false;
    },
  };
}

type CreateBackgroundTaskFromForkAgentOptions = {
  store: LiveKitStore;
  stateStore: BackgroundTaskStateStore;
  agent: ForkAgent<Message>;
};

async function createBackgroundTaskFromForkAgent({
  store,
  stateStore,
  agent,
}: CreateBackgroundTaskFromForkAgentOptions): Promise<ForkAgentHandle> {
  const taskId = crypto.randomUUID();
  const createdAt = new Date();
  stateStore.set(taskId, toBackgroundTaskState(agent));

  store.commit(
    catalog.events.taskInited({
      id: taskId,
      cwd: agent.cwd,
      background: true,
      createdAt,
      initMessages: agent.initMessages,
      initTitle: agent.initTitle,
    }),
  );

  return {
    taskId,
    cwd: agent.cwd,
    label: agent.label,
  };
}

function toBackgroundTaskState(agent: ForkAgent<Message>): BackgroundTaskState {
  return {
    parentTaskId: agent.parentTaskId,
    tools: agent.tools,
    useCase: agent.label,
    baselineStepCount: agent.baselineStepCount,
  };
}

type BackgroundTaskAdapterOptions = BackgroundTaskRunnerOptions & {
  stateStore: BackgroundTaskStateStore;
};

class BackgroundTaskAdapter implements BackgroundTaskRuntimeAdapter {
  private readonly blobStore: BlobStore;
  private readonly llm: LLMRequestData;
  private readonly cwd: string;
  private readonly rg: string;
  private readonly filesystem: FileSystem;
  private readonly customAgents: CustomAgent[] | undefined;
  private readonly skills: Skill[] | undefined;
  private readonly mcpHub: McpHub | undefined;
  private readonly parentTaskId: string | undefined;
  private readonly parentFileStateCache: FileStateCache | undefined;
  private readonly stateStore: BackgroundTaskStateStore;
  private readonly autoMemoryManager: AutoMemoryManager;
  private readonly fileStateCaches = new Map<string, FileStateCache>();
  private readonly backgroundJobManagers = new Map<
    string,
    BackgroundJobManager
  >();

  constructor(options: BackgroundTaskAdapterOptions) {
    this.blobStore = options.blobStore;
    this.llm = options.llm;
    this.cwd = options.cwd;
    this.rg = options.rg;
    this.filesystem = options.filesystem;
    this.customAgents = options.customAgents;
    this.skills = options.skills;
    this.mcpHub = options.mcpHub;
    this.parentTaskId = options.parentTaskId;
    this.parentFileStateCache = options.parentFileStateCache;
    this.stateStore = options.stateStore;
    this.autoMemoryManager =
      options.autoMemoryManager ?? new AutoMemoryManager();
  }

  dispose() {
    for (const manager of this.backgroundJobManagers.values()) {
      manager.killAll();
    }
    this.backgroundJobManagers.clear();
  }

  getRequestGetters(context: BackgroundTaskRuntimeContext) {
    return {
      getLLM: () => this.llm,
      getEnvironment: async () =>
        readEnvironment({ cwd: context.cwd ?? this.cwd }),
      getAutoMemory: async () =>
        this.autoMemoryManager
          .readContext(context.cwd ?? this.cwd)
          .catch((error) => {
            logger.warn("Failed to read long-term memory context", error);
            return undefined;
          }),
      getMcpInfo: () => {
        const status = this.mcpHub?.status.value;
        return {
          toolset: status?.toolset || {},
          instructions: status?.instructions || "",
        };
      },
      getCustomAgents: () => this.customAgents,
      getSkills: () => this.skills,
    };
  }

  readBackgroundTaskState(taskId: string) {
    return this.stateStore.read(taskId);
  }

  copyFileStateCache(sourceTaskId: string, targetTaskId: string) {
    const source =
      this.fileStateCaches.get(sourceTaskId) ??
      (sourceTaskId === this.parentTaskId
        ? this.parentFileStateCache
        : undefined);
    if (!source) return;

    const target = this.getFileStateCache(targetTaskId);
    target.clear();
    for (const [key, value] of source) {
      target.set(key, value);
    }
  }

  clearFileStateCache(taskId: string) {
    this.getFileStateCache(taskId).clear();
  }

  async executeToolCall(args: BackgroundTaskToolCallExecution) {
    const tool = {
      type: `tool-${args.toolName}`,
      toolCallId: args.toolCallId,
      state: "input-available",
      input: resolveToolCallArgs(args.input, args.storeId),
    } as ToolUIPart<UITools>;

    const result = await processContentOutput(
      this.blobStore,
      await executeToolCall(
        tool,
        this.createToolCallOptions(args.taskId),
        this.cwd,
        args.abortSignal,
        this.llm.contentType,
      ),
    );

    return maybePersistToolResult(
      args.toolName,
      args.toolCallId,
      args.taskId,
      result,
    );
  }

  onBackgroundTaskError(taskId: string, error: Error) {
    logger.warn({ taskId, error }, "Background task failed");
  }

  private createToolCallOptions(taskId: string): ToolCallOptions {
    return {
      rg: this.rg,
      fileSystem: this.filesystem,
      fileStateCache: this.getFileStateCache(taskId),
      blobStore: this.blobStore,
      customAgents: this.customAgents,
      skills: this.skills,
      mcpHub: this.mcpHub,
      backgroundJobManager: this.getBackgroundJobManager(taskId),
    };
  }

  private getFileStateCache(taskId: string) {
    let cache = this.fileStateCaches.get(taskId);
    if (!cache) {
      cache = new FileStateCache();
      this.fileStateCaches.set(taskId, cache);
    }
    return cache;
  }

  private getBackgroundJobManager(taskId: string) {
    let manager = this.backgroundJobManagers.get(taskId);
    if (!manager) {
      manager = new BackgroundJobManager();
      this.backgroundJobManagers.set(taskId, manager);
    }
    return manager;
  }
}
