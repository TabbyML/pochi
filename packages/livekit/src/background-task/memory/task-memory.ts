import {
  constants,
  type ContextWindowUsage,
  TaskMemoryFileUri,
  type TaskMemoryState,
  getLogger,
  prompts,
} from "@getpochi/common";
import type { ToolSpecInput } from "@getpochi/tools";
import { type UIMessage, isStaticToolUIPart } from "ai";
import {
  makeMessagesQuery,
  makeStoreFileQuery,
  makeTaskQuery,
} from "../../livestore/default-queries";
import type { LiveKitStore, Message } from "../../types";
import {
  type StartForkAgent,
  buildForkAgentInitTitle,
  createForkAgent,
} from "../fork-agent";
import { type MemoryStateStore, createMemoryStateStore } from "../state-store";

const logger = getLogger("TaskMemory");

type ExtractionMetrics = {
  tokens: number;
  trailingMessageId: string | undefined;
};

type TaskMemoryExtractionResult = "pending" | "succeeded" | "failed";

const DefaultTaskMemoryState: TaskMemoryState = {
  extractionAttemptsSinceCompact: 0,
  isExtracting: false,
  extractionCount: 0,
};

const TaskMemoryAllowedTools: readonly ToolSpecInput[] = [
  "readFile",
  `writeToFile(${TaskMemoryFileUri})`,
];
const TaskMemoryMaxSteps = 3;

const TaskMemoryStoreFilePath = new URL(TaskMemoryFileUri).pathname;

function getExtractionMetrics<TMessage extends UIMessage>(data: {
  messages: TMessage[];
  contextWindowUsage?: ContextWindowUsage;
}): ExtractionMetrics {
  const last = data.messages.at(-1);
  return {
    tokens: computeTotalTokens(data.contextWindowUsage),
    trailingMessageId: last?.id,
  };
}

export function resolveExtractionTrigger(
  compactThreshold: number | undefined,
): number {
  const base =
    compactThreshold && compactThreshold > 0
      ? compactThreshold
      : constants.TaskMemoryFallbackCompactThreshold;
  return Math.round(base * constants.TaskMemoryExtractionThresholdRatio);
}

function shouldExtractTaskMemory(
  state: TaskMemoryState,
  metrics: ExtractionMetrics,
  trigger: number,
): boolean {
  if (state.isExtracting) return false;
  if (metrics.tokens < trigger) return false;
  if (state.extractedSinceCompact) return false;

  return (
    state.extractionAttemptsSinceCompact <
    constants.MaxTaskMemoryExtractionAttemptsPerCycle
  );
}

function toExtractingState(
  state: TaskMemoryState,
  metrics: ExtractionMetrics,
): TaskMemoryState {
  return {
    ...state,
    isExtracting: true,
    extractionAttemptsSinceCompact: state.extractionAttemptsSinceCompact + 1,
    pendingExtractionMessageId: metrics.trailingMessageId,
  };
}

async function startTaskMemoryExtraction<TMessage extends UIMessage>({
  state,
  metrics,
  setTaskMemoryState,
  startForkAgent,
  parentTaskId,
  parentMessages,
  parentCwd,
  parentTaskTitle,
  existingMemory,
}: {
  state: TaskMemoryState;
  metrics: ExtractionMetrics;
  setTaskMemoryState: MemoryStateStore<TaskMemoryState>["set"];
  startForkAgent: StartForkAgent<TMessage>;
  parentTaskId: string;
  parentMessages: TMessage[];
  parentCwd: string | undefined;
  parentTaskTitle?: string;
  existingMemory?: string;
}) {
  const nextState = toExtractingState(state, metrics);
  await setTaskMemoryState(nextState);

  try {
    const agent = createForkAgent({
      label: "task-memory",
      initTitle: buildForkAgentInitTitle("task-memory", parentTaskTitle),
      parentTaskId,
      parentMessages,
      parentCwd,
      directive: prompts.taskMemory.buildExtractionDirective(existingMemory),
      tools: TaskMemoryAllowedTools,
      maxSteps: TaskMemoryMaxSteps,
    });
    const handle = await startForkAgent(agent);

    await setTaskMemoryState({
      ...nextState,
      activeTaskId: handle.taskId,
    });

    return handle;
  } catch (error) {
    logger.warn("Failed to start task-memory extraction fork agent", error);
    await setTaskMemoryState({
      ...nextState,
      isExtracting: false,
      activeTaskId: undefined,
      pendingExtractionMessageId: undefined,
    });
    throw error;
  }
}

function resolveTaskMemoryExtractionState({
  state,
  activeTask,
  activeMessages,
}: {
  state: TaskMemoryState;
  activeTask: { status: string } | null | undefined;
  activeMessages: UIMessage[];
}): TaskMemoryState | undefined {
  if (!state.activeTaskId || !state.isExtracting) return undefined;

  const extractionResult = getTaskMemoryExtractionResult(
    activeTask,
    activeMessages,
  );
  if (extractionResult === "pending") return undefined;

  const succeeded = extractionResult === "succeeded";
  return {
    ...state,
    isExtracting: false,
    extractedSinceCompact: succeeded ? true : state.extractedSinceCompact,
    extractionCount: succeeded
      ? state.extractionCount + 1
      : state.extractionCount,
    lastExtractionMessageId: succeeded
      ? (state.pendingExtractionMessageId ?? state.lastExtractionMessageId)
      : state.lastExtractionMessageId,
    pendingExtractionMessageId: undefined,
    activeTaskId: undefined,
  };
}

function getTaskMemoryExtractionResult(
  task: { status: string } | null | undefined,
  messages: UIMessage[],
): TaskMemoryExtractionResult {
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isStaticToolUIPart(part) || part.state !== "output-available") {
        continue;
      }
      if (!part.input || typeof part.input !== "object") continue;
      if ("path" in part.input && part.input.path === TaskMemoryFileUri) {
        return "succeeded";
      }
    }
  }

  if (!task) return "pending";
  if (task.status === "pending-model" || task.status === "pending-tool") {
    return "pending";
  }

  return "failed";
}

function computeTotalTokens(usage?: ContextWindowUsage) {
  if (!usage) return 0;
  return (
    (usage.system ?? 0) +
    (usage.tools ?? 0) +
    (usage.messages ?? 0) +
    (usage.files ?? 0) +
    (usage.toolResults ?? 0) +
    (usage.projectMemory ?? 0)
  );
}

type TaskMemoryAdaptorOptions = {
  store: LiveKitStore;
  backgroundTask: {
    startForkAgent: StartForkAgent<Message>;
    waitForTaskDone?: (taskId: string) => Promise<void>;
  };
  taskMemoryStateStore?: MemoryStateStore<TaskMemoryState>;
  parentTaskId: string;
  parentCwd: string | undefined | (() => string | undefined);
  isSubTask?: boolean;
  getCompactThreshold?: () => number | undefined;
};

export class TaskMemoryAdaptor {
  private readonly stateStore: MemoryStateStore<TaskMemoryState>;

  constructor(private readonly options: TaskMemoryAdaptorOptions) {
    this.stateStore =
      options.taskMemoryStateStore ??
      createMemoryStateStore<TaskMemoryState>({ ...DefaultTaskMemoryState });
  }

  getState() {
    return this.stateStore.get() ?? { ...DefaultTaskMemoryState };
  }

  resetForNewCompactionCycle() {
    return this.stateStore.set({
      ...this.getState(),
      extractionAttemptsSinceCompact: 0,
      extractedSinceCompact: false,
    });
  }

  async update(data: {
    messages: Message[];
    contextWindowUsage?: ContextWindowUsage;
  }) {
    if (this.options.isSubTask) return false;
    await this.settle();

    const state = this.getState();
    const metrics = getExtractionMetrics(data);
    const trigger = resolveExtractionTrigger(
      this.options.getCompactThreshold?.(),
    );
    if (!shouldExtractTaskMemory(state, metrics, trigger)) {
      return false;
    }

    return this.startExtraction(state, metrics, data.messages);
  }

  private async startExtraction(
    state: TaskMemoryState,
    metrics: ExtractionMetrics,
    messages: Message[],
  ) {
    const task = this.options.store.query(
      makeTaskQuery(this.options.parentTaskId),
    );
    if (!task) return false;

    try {
      const parentCwd = this.getParentCwd();
      const memoryFile = this.options.store.query(
        makeStoreFileQuery(TaskMemoryStoreFilePath),
      );
      const handle = await startTaskMemoryExtraction({
        state,
        metrics,
        setTaskMemoryState: (nextState) => this.stateStore.set(nextState),
        startForkAgent: (agent) =>
          this.options.backgroundTask.startForkAgent(agent),
        parentTaskId: this.options.parentTaskId,
        parentMessages: messages,
        parentCwd,
        parentTaskTitle: task.title ?? undefined,
        existingMemory: memoryFile?.content ?? undefined,
      });
      this.watchTaskDone(handle.taskId);
      return true;
    } catch (error) {
      logger.warn("Failed to start task-memory extraction", error);
      return false;
    }
  }

  async settle() {
    const state = this.getState();
    if (!state.activeTaskId || !state.isExtracting) return false;

    const nextState = resolveTaskMemoryExtractionState({
      state,
      activeTask: this.options.store.query(makeTaskQuery(state.activeTaskId)),
      activeMessages: this.options.store
        .query(makeMessagesQuery(state.activeTaskId))
        .map((row) => row.data as Message),
    });
    if (!nextState) return false;

    await this.stateStore.set(nextState);
    return true;
  }

  private getParentCwd() {
    const { parentCwd } = this.options;
    return typeof parentCwd === "function" ? parentCwd() : parentCwd;
  }

  private watchTaskDone(taskId: string | undefined) {
    const { waitForTaskDone } = this.options.backgroundTask;
    if (!taskId || !waitForTaskDone) return;

    void waitForTaskDone(taskId)
      .then(() => this.settle())
      .catch((error) => {
        logger.warn("Failed to settle task-memory extraction", error);
      });
  }
}
