import type {
  AutoMemoryContext,
  BackgroundTaskState,
  TaskMemoryState,
} from "@getpochi/common";
import type { ChatInit, ChatOnFinishCallback } from "ai";
import { describe, expect, it, vi } from "vitest";
import {
  type BlobStore,
  type LiveChatKitBackgroundTaskOptions,
  type LiveKitStore,
  type Message,
  type Task,
} from "../..";
import { LiveChatKit } from "../live-chat-kit";

type RunningTaskAdaptor = NonNullable<
  LiveChatKitBackgroundTaskOptions["adaptor"]
>;

describe("LiveChatKit memory lifecycle", () => {
  it("starts background task scheduling when an adaptor is provided", async () => {
    const store = new FakeStore([
      makeTask({
        id: "parent",
        status: "pending-model",
        background: false,
      }),
    ]);
    const chatKit = new LiveChatKit<FakeChat>({
      taskId: "parent",
      store: store as unknown as LiveKitStore,
      blobStore: {} as BlobStore,
      chatClass: FakeChat,
      getters: {
        getLLM: () => ({ id: "test-model" }) as never,
      },
      backgroundTask: {
        adaptor: makeRunningTaskAdaptor(),
      },
    });

    expect(store.subscriptions).toContain("runnableTasks");
    await chatKit.disposeBackgroundTasks();
  });

  it("clears file-state cache before returning a retry message", async () => {
    const clearFileStateCache = vi.fn();
    const store = new FakeStore([
      makeTask({
        id: "parent",
        status: "pending-model",
        background: false,
      }),
    ]);
    const chatKit = new LiveChatKit<FakeChat>({
      taskId: "parent",
      store: store as unknown as LiveKitStore,
      blobStore: {} as BlobStore,
      chatClass: FakeChat,
      getters: {
        getLLM: () => ({ id: "test-model" }) as never,
      },
      clearFileStateCache,
    });

    const retryMessage = await chatKit.prepareLastMessageForRetry(
      retryableAssistantMessage(),
    );

    expect(clearFileStateCache).toHaveBeenCalledTimes(1);
    expect(retryMessage).toBeTruthy();
  });

  it("starts task-memory and auto-memory from stream finish inside LiveKit", async () => {
    const store = new FakeStore([
      makeTask({
        id: "parent",
        status: "pending-model",
        background: false,
        title: "Build shared runner",
      }),
    ]);
    const backgroundTaskStateStore = new BackgroundTaskStateStore();
    const chatKit = new LiveChatKit<FakeChat>({
      taskId: "parent",
      store: store as unknown as LiveKitStore,
      blobStore: {} as BlobStore,
      chatClass: FakeChat,
      getters: {
        getLLM: () => ({ id: "test-model" }) as never,
      },
      backgroundTask: {
        stateStore: backgroundTaskStateStore,
      },
      memory: {
        parentCwd: "/repo",
        autoMemoryBackend: makeAutoMemoryBackend(),
      },
    });

    chatKit.chat.messages = [userMessage(), assistantMessage()];
    chatKit.chat.finish(assistantMessage());
    await chatKit.drainBackgroundTasksAndSettleMemory();

    const memoryTasks = store.backgroundTasks().map((task) => ({
      title: task.title,
      useCase: backgroundTaskStateStore.read(task.id)?.useCase,
    }));
    expect(memoryTasks).toEqual(
      expect.arrayContaining([
        {
          title: "[Task Memory Extraction] Build shared runner",
          useCase: "task-memory",
        },
        {
          title: "[Auto Memory Extraction] Build shared runner",
          useCase: "auto-memory",
        },
      ]),
    );
  });

  it("settles task-memory after the background task completes", async () => {
    const store = new FakeStore([
      makeTask({
        id: "parent",
        status: "pending-model",
        background: false,
        title: "Build shared runner",
      }),
    ]);
    const backgroundTaskStateStore = new BackgroundTaskStateStore();
    let taskMemoryState: TaskMemoryState | undefined;
    const taskMemoryStateStore = {
      get: () => taskMemoryState,
      set: (state: TaskMemoryState) => {
        taskMemoryState = state;
      },
    };
    const chatKit = new LiveChatKit<FakeChat>({
      taskId: "parent",
      store: store as unknown as LiveKitStore,
      blobStore: {} as BlobStore,
      chatClass: FakeChat,
      getters: {
        getLLM: () => ({ id: "test-model" }) as never,
      },
      backgroundTask: {
        stateStore: backgroundTaskStateStore,
      },
      memory: {
        parentCwd: "/repo",
        taskMemoryStateStore,
      },
    });

    chatKit.chat.messages = [userMessage(), assistantMessage()];
    chatKit.chat.finish(assistantMessage());
    await chatKit.drainBackgroundTasksAndSettleMemory();

    const activeTaskId = taskMemoryState?.activeTaskId;
    expect(activeTaskId).toBeTruthy();

    store.updateTaskStatus(activeTaskId ?? "", "failed");

    await chatKit.drainBackgroundTasksAndSettleMemory();
    expect(taskMemoryState).toMatchObject({
      isExtracting: false,
      activeTaskId: undefined,
    });
  });
});

class BackgroundTaskStateStore {
  private readonly states = new Map<string, BackgroundTaskState>();

  read(taskId: string) {
    return this.states.get(taskId);
  }

  set(taskId: string, state: BackgroundTaskState) {
    this.states.set(taskId, state);
  }
}

class FakeChat {
  messages: Message[];
  private readonly onFinish: ChatOnFinishCallback<Message>;

  constructor(init: ChatInit<Message>) {
    this.messages = init.messages ?? [];
    this.onFinish = init.onFinish ?? (() => {});
  }

  async stop() {}

  finish(message: Message) {
    this.onFinish({
      message,
      messages: this.messages,
      isAbort: false,
      isDisconnect: false,
      isError: false,
      finishReason: "stop",
    });
  }
}

const autoMemoryContext: AutoMemoryContext = {
  enabled: true,
  repoKey: "repo",
  memoryDir: "/repo/.pochi/memory",
  indexPath: "/repo/.pochi/memory/index.md",
  indexContent: "",
  indexTruncated: false,
  manifest: [],
  transcriptDir: "/repo/.pochi/transcripts",
};

function makeAutoMemoryBackend() {
  return {
    readContext: vi.fn(async () => autoMemoryContext),
    writeTaskTranscript: vi.fn(async () => ({
      transcriptDir: autoMemoryContext.transcriptDir,
      filename: "parent.md",
    })),
    beginDreamRun: vi.fn(async () => undefined),
    finishDreamRun: vi.fn(async () => undefined),
  };
}

function makeRunningTaskAdaptor(): RunningTaskAdaptor {
  return {
    getRequestGetters: () => ({
      getLLM: () => ({ id: "test-model" }) as never,
    }),
    executeToolCall: vi.fn(async () => undefined),
  };
}

class FakeStore {
  readonly storeId = "livekit-memory-test-store";
  readonly subscriptions: string[] = [];
  private readonly tasks = new Map<string, Task>();
  private readonly messages = new Map<string, Message[]>();

  constructor(tasks: Task[]) {
    for (const task of tasks) {
      this.tasks.set(task.id, task);
    }
  }

  query(query: { label?: string; hash?: string }) {
    if (query.label === "task") {
      return this.tasks.get(this.extractTaskId(query));
    }
    if (query.label === "messages") {
      const taskId = this.extractTaskId(query);
      return (this.messages.get(taskId) ?? []).map((message) => ({
        id: message.id,
        taskId,
        data: message,
      }));
    }
    if (query.label === "file") {
      return undefined;
    }
    if (query.label === "runnableTasks") {
      return this.backgroundTasks().filter(
        (task) => task.status === "pending-model" || task.status === "pending-tool",
      );
    }
    throw new Error(`Unsupported query ${query.label ?? query.hash}`);
  }

  subscribe(query: { label?: string }, _callback: () => void) {
    this.subscriptions.push(query.label ?? "");
    return () => {};
  }

  commit(event: { name: string; args: Record<string, unknown> }) {
    if (event.name === "v1.TaskInited") {
      this.commitTaskInited(event.args);
      return;
    }
    if (event.name === "v1.ChatStreamFinished") {
      this.commitChatStreamFinished(event.args);
      return;
    }
    throw new Error(`Unsupported event ${event.name}`);
  }

  backgroundTasks() {
    return [...this.tasks.values()].filter((task) => task.background);
  }

  updateTaskStatus(taskId: string, status: Task["status"]) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Unknown task ${taskId}`);
    this.tasks.set(taskId, { ...task, status });
  }

  private commitTaskInited(args: Record<string, unknown>) {
    const id = args.id as string;
    const initMessages = (args.initMessages ?? []) as Message[];
    const createdAt = args.createdAt as Date;
    this.tasks.set(
      id,
      makeTask({
        id,
        cwd: args.cwd as string | undefined,
        background: args.background as boolean | undefined,
        status: initMessages.length > 0 ? "pending-model" : "pending-input",
        title: args.initTitle as string | undefined,
        createdAt,
        updatedAt: createdAt,
      }),
    );
    this.messages.set(id, initMessages);
  }

  private commitChatStreamFinished(args: Record<string, unknown>) {
    const id = args.id as string;
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Unknown task ${id}`);

    const message = args.data as Message;
    const updatedAt = args.updatedAt as Date;
    this.tasks.set(task.id, {
      ...task,
      status: args.status as Task["status"],
      totalTokens: args.totalTokens as number | null,
      updatedAt,
    });
    this.messages.set(id, [
      ...(this.messages.get(id) ?? []).filter((item) => item.id !== message.id),
      message,
    ]);
  }

  private extractTaskId(query: { hash?: string }) {
    for (const taskId of this.tasks.keys()) {
      if (query.hash?.includes(taskId)) return taskId;
    }
    throw new Error(`Unable to extract task id from query hash ${query.hash}`);
  }
}

function makeTask({
  id,
  status,
  cwd = "/repo",
  background = true,
  title = null,
  createdAt = new Date(0),
  updatedAt = new Date(0),
}: {
  id: string;
  status: Task["status"];
  cwd?: string;
  background?: boolean;
  title?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}): Task {
  return {
    id,
    shareId: null,
    cwd,
    isPublicShared: true,
    title,
    parentId: null,
    runAsync: false,
    background,
    status,
    todos: [],
    git: null,
    pendingToolCalls: null,
    lineChanges: null,
    totalTokens: null,
    lastStepDuration: null,
    lastCheckpointHash: null,
    error: null,
    createdAt,
    updatedAt,
    modelId: null,
    displayId: null,
  };
}

function userMessage(): Message {
  return {
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text: "please implement it" }],
  } as Message;
}

function assistantMessage(): Message {
  return {
    id: "assistant-1",
    role: "assistant",
    parts: [
      { type: "text", text: "done" },
      {
        type: "tool-attemptCompletion",
        toolCallId: "completion-1",
        state: "output-available",
        input: {},
        output: { success: true },
      },
    ],
    metadata: {
      kind: "assistant",
      finishReason: "stop",
      systemPromptTokens: 20_000,
      toolsTokens: 0,
      totalTokens: 20_000,
    },
  } as unknown as Message;
}

function retryableAssistantMessage(): Message {
  return {
    id: "assistant-retry",
    role: "assistant",
    parts: [
      { type: "step-start" },
      {
        type: "tool-readFile",
        toolCallId: "call-read-file",
        state: "output-available",
        input: { path: "src/app.ts" },
        output: { content: "const answer = 42;", isTruncated: false },
      },
      { type: "step-start" },
      {
        type: "tool-executeCommand",
        toolCallId: "call-exec",
        state: "input-streaming",
        input: null,
      },
    ],
  } as unknown as Message;
}
