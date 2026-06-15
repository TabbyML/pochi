import {
  constants,
  type ContextWindowUsage,
  TaskMemoryFileUri,
  type TaskMemoryState,
  getLogger,
  prompts,
} from "@getpochi/common";
import { type ToolSpecInput, isUserInputToolPart } from "@getpochi/tools";
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
import {
  type MaybePromise,
  type MemoryStateStore,
  createMemoryStateStore,
} from "../state-store";

const logger = getLogger("TaskMemory");

type ExtractionMetrics = {
  tokens: number;
  toolCalls: number;
  trailingMessageId: string | undefined;
  trailingMessageHasOpenToolCall: boolean;
};

type TaskMemoryExtractionResult = "pending" | "succeeded" | "failed";

const DefaultTaskMemoryState: TaskMemoryState = {
  initialized: false,
  lastExtractionTokens: 0,
  lastExtractionToolCalls: 0,
  isExtracting: false,
  extractionCount: 0,
};

const TaskMemoryAllowedTools: readonly ToolSpecInput[] = [
  "readFile",
  `writeToFile(${TaskMemoryFileUri})`,
];

const TaskMemoryStoreFilePath = new URL(TaskMemoryFileUri).pathname;

type SetTaskMemoryState = (state: TaskMemoryState) => Promise<void> | void;

type TaskMemoryBackgroundTask = {
  startForkAgent: StartForkAgent<Message>;
  waitForTaskDone?: (taskId: string) => MaybePromise<void>;
};

function getExtractionMetrics<TMessage extends UIMessage>(data: {
  messages: TMessage[];
  contextWindowUsage?: ContextWindowUsage;
}): ExtractionMetrics {
  const last = data.messages.at(-1);
  return {
    tokens: computeTotalTokens(data.contextWindowUsage),
    toolCalls: countToolCalls(data.messages),
    trailingMessageId: last?.id,
    trailingMessageHasOpenToolCall: lastMessageHasOpenToolCall(data.messages),
  };
}

function shouldExtractTaskMemory(
  state: TaskMemoryState,
  metrics: ExtractionMetrics,
): boolean {
  if (state.isExtracting) return false;

  if (!state.initialized) {
    return metrics.tokens >= constants.TaskMemoryInitTokenThreshold;
  }

  const tokenDelta = metrics.tokens - state.lastExtractionTokens;
  const toolCallDelta = metrics.toolCalls - state.lastExtractionToolCalls;

  return (
    tokenDelta >= constants.TaskMemoryUpdateTokenIncrement &&
    toolCallDelta >= constants.TaskMemoryUpdateToolCallThreshold
  );
}

function toExtractingState(
  state: TaskMemoryState,
  metrics: ExtractionMetrics,
): TaskMemoryState {
  return {
    ...state,
    initialized: true,
    isExtracting: true,
    lastExtractionTokens: metrics.tokens,
    lastExtractionToolCalls: metrics.toolCalls,
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
  setTaskMemoryState: SetTaskMemoryState;
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
      if (
        isStaticToolUIPart(part) &&
        part.state === "output-available" &&
        isTaskMemoryPath(part.input)
      ) {
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

function lastMessageHasOpenToolCall(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return false;
  return last.parts.some((part) => {
    if (!isStaticToolUIPart(part) || isUserInputToolPart(part)) return false;
    return part.state !== "output-available" && part.state !== "output-error";
  });
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

function countToolCalls(messages: UIMessage[]): number {
  let count = 0;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (isStaticToolUIPart(part)) {
        count++;
      }
    }
  }
  return count;
}

function isTaskMemoryPath(input: unknown): boolean {
  if (!input || typeof input !== "object" || !("path" in input)) return false;
  return input.path === TaskMemoryFileUri;
}

type TaskMemoryAdaptorOptions = {
  store: LiveKitStore;
  backgroundTask: TaskMemoryBackgroundTask;
  taskMemoryStateStore?: MemoryStateStore<TaskMemoryState>;
  parentTaskId: string;
  parentCwd: string | undefined | (() => string | undefined);
  isSubTask?: boolean;
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

  resetTokenBaseline() {
    return this.setTaskMemoryState({
      ...this.getState(),
      lastExtractionTokens: 0,
    });
  }

  async update(data: {
    messages: Message[];
    contextWindowUsage?: ContextWindowUsage;
  }) {
    if (this.options.isSubTask) return false;
    await this.settle();

    const state = this.getState();
    const task = this.options.store.query(
      makeTaskQuery(this.options.parentTaskId),
    );
    if (!task) return false;

    const metrics = getExtractionMetrics(data);
    if (!shouldExtractTaskMemory(state, metrics)) {
      return false;
    }

    try {
      const parentCwd = this.getParentCwd();
      const memoryFile = this.options.store.query(
        makeStoreFileQuery(TaskMemoryStoreFilePath),
      );
      const handle = await startTaskMemoryExtraction({
        state,
        metrics,
        setTaskMemoryState: (nextState) => this.setTaskMemoryState(nextState),
        startForkAgent: (agent) =>
          this.options.backgroundTask.startForkAgent(agent),
        parentTaskId: this.options.parentTaskId,
        parentMessages: data.messages,
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

    await this.setTaskMemoryState(nextState);
    return true;
  }

  private setTaskMemoryState(nextState: TaskMemoryState) {
    return this.stateStore.set(nextState);
  }

  private getParentCwd() {
    const { parentCwd } = this.options;
    return typeof parentCwd === "function" ? parentCwd() : parentCwd;
  }

  private watchTaskDone(taskId: string | undefined) {
    const { waitForTaskDone } = this.options.backgroundTask;
    if (!taskId || !waitForTaskDone) return;

    void Promise.resolve(waitForTaskDone(taskId))
      .then(() => this.settle())
      .catch((error) => {
        logger.warn("Failed to settle task-memory extraction", error);
      });
  }
}
