import type {
  AutoMemoryContext,
  BackgroundTaskState,
  TaskMemoryState,
} from "@getpochi/common";
import { Duration } from "@livestore/utils/effect";
import type { ChatInit, ChatOnErrorCallback, ChatOnFinishCallback } from "ai";
import { describe, expect, it, vi } from "vitest";
import {
  type BlobStore,
  type LiveKitStore,
  type Message,
  type RunningTaskAdaptor,
  type Task,
} from "../..";
import { LiveChatKit } from "../live-chat-kit";

describe("LiveChatKit memory lifecycle", () => {
  it("starts background task scheduling after the first stream finishes", async () => {
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

    expect(store.subscriptions).not.toContain("runnableTasks");

    chatKit.chat.messages = [userMessage(), assistantMessage()];
    chatKit.chat.finish(assistantMessage());

    expect(store.subscriptions).toContain("runnableTasks");
    await chatKit.disposeBackgroundTasks();
  });

  it("marks unfinished tool calls as errors when a stream fails", async () => {
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
    });
    const message = assistantReadFileMessage("input-available");
    chatKit.chat.messages = [userMessage(), message];

    const abortError = new Error("Transport is aborted");
    abortError.name = "AbortError";
    chatKit.chat.fail(abortError);

    expect(chatKit.chat.messages.at(-1)?.parts[0]).toMatchObject({
      type: "tool-readFile",
      toolCallId: "call-read-file",
      state: "output-error",
      input: { path: "README.md" },
      errorText: "User aborted the tool call",
    });

    const savedMessage = store.taskMessages("parent").at(-1);
    expect(savedMessage?.parts[0]).toMatchObject({
      type: "tool-readFile",
      toolCallId: "call-read-file",
      state: "output-error",
      input: { path: "README.md" },
      errorText: "User aborted the tool call",
    });
  });

  it("persists tool results when recording execution duration", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(1_000));
      const store = new FakeStore([
        makeTask({
          id: "parent",
          status: "pending-tool",
          background: false,
        }),
      ]);
      store.setTaskMessages("parent", [
        userMessage(),
        assistantReadFileMessage("input-available"),
      ]);
      const chatKit = new LiveChatKit<FakeChat>({
        taskId: "parent",
        store: store as unknown as LiveKitStore,
        blobStore: {} as BlobStore,
        chatClass: FakeChat,
        getters: {
          getLLM: () => ({ id: "test-model" }) as never,
        },
      });

      chatKit.markStartToolsExecution();
      vi.setSystemTime(new Date(1_250));
      chatKit.chat.messages = [
        userMessage(),
        {
          ...assistantReadFileMessage("input-available"),
          parts: [
            {
              type: "tool-readFile",
              toolCallId: "call-read-file",
              state: "output-available",
              input: { path: "README.md" },
              output: { content: "README contents" },
            },
          ],
        } as unknown as Message,
      ];

      chatKit.markEndToolsExecution();

      expect(chatKit.chat.messages.at(-1)?.parts[0]).toMatchObject({
        state: "output-available",
        output: { content: "README contents" },
      });
      expect(chatKit.chat.messages.at(-1)?.metadata).toMatchObject({
        totalToolsExecutionDuration: 250,
      });
      expect(store.taskMessages("parent").at(-1)?.parts[0]).toMatchObject({
        state: "output-available",
        output: { content: "README contents" },
      });
      expect(store.taskMessages("parent").at(-1)?.metadata).toMatchObject({
        totalToolsExecutionDuration: 250,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("strips OpenAI item references from the failed step before saving", () => {
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
    });
    const message = {
      id: "assistant-1",
      role: "assistant",
      metadata: { kind: "assistant" },
      parts: [
        { type: "step-start" },
        {
          type: "reasoning",
          text: "Committed reasoning",
          state: "done",
          providerMetadata: { openai: { itemId: "rs_committed" } },
        },
        { type: "step-start" },
        {
          type: "reasoning",
          text: "Done part from failed response",
          state: "done",
          providerMetadata: {
            openai: {
              itemId: "rs_done_but_uncommitted",
              reasoningEncryptedContent: "encrypted-reasoning",
            },
          },
        },
        {
          type: "text",
          text: "Partial response",
          state: "done",
          providerMetadata: {
            openai: { itemId: "msg_uncommitted" },
            google: { custom: "preserved" },
          },
        },
      ],
    } as Message;
    chatKit.chat.messages = [userMessage(), message];

    chatKit.chat.fail(new Error("network error"));

    for (const failedMessage of [
      chatKit.chat.messages.at(-1),
      store.taskMessages("parent").at(-1),
    ]) {
      expect((failedMessage?.parts[1] as any).providerMetadata).toEqual({
        openai: { itemId: "rs_committed" },
      });
      expect((failedMessage?.parts[3] as any).providerMetadata).toEqual({
        openai: { reasoningEncryptedContent: "encrypted-reasoning" },
      });
      expect((failedMessage?.parts[4] as any).providerMetadata).toEqual({
        google: { custom: "preserved" },
      });
    }
  });

  it.each([
    ["tool-attemptCompletion", "completion-1", { result: "Done." }],
    [
      "tool-askFollowupQuestion",
      "question-1",
      { questions: [{ question: "Continue?", options: [] }] },
    ],
    [
      "tool-renderWidget",
      "widget-1",
      { title: "Preview", widgetCode: "<div />", guidelinesRead: true },
    ],
  ])(
    "does not mark available %s as an error when a stream fails",
    async (type, toolCallId, input) => {
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
      });
      const message = assistantUserInputToolMessage(type, toolCallId, input);
      chatKit.chat.messages = [userMessage(), message];

      chatKit.chat.fail(new Error("network error"));

      expect(chatKit.chat.messages.at(-1)?.parts[1]).toMatchObject({
        type,
        toolCallId,
        state: "input-available",
        input,
      });
      expect(chatKit.chat.messages.at(-1)?.parts[1]).not.toHaveProperty(
        "errorText",
      );

      const savedMessage = store.taskMessages("parent").at(-1);
      expect(savedMessage?.parts[1]).toMatchObject({
        type,
        toolCallId,
        state: "input-available",
        input,
      });
      expect(savedMessage?.parts[1]).not.toHaveProperty("errorText");
    },
  );

  it("keeps the user message when the stream finishes before the assistant placeholder is added", () => {
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
    });

    // Reproduces an early abort during task init: the abort-aware UI stream
    // terminates with zero chunks (isAbort=false), so the streamed assistant
    // message was never pushed into chat.messages, leaving only the user
    // message when onFinish runs.
    chatKit.chat.messages = [userMessage()];
    chatKit.chat.finish(blankAssistantMessage());

    expect(chatKit.chat.messages.map((message) => message.id)).toContain(
      "user-1",
    );
  });

  it("updates task total tokens from the formatted compact estimate", () => {
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
    });
    const messages = [
      {
        id: "old-user",
        role: "user",
        parts: [{ type: "text", text: "x".repeat(100_000) }],
      },
      assistantMessage(),
      {
        id: "compact-user",
        role: "user",
        parts: [
          { type: "text", text: "<compact>short summary</compact>" },
          { type: "text", text: "continue" },
        ],
      },
    ] as Message[];

    (
      chatKit as unknown as {
        updateTotalTokensEstimate(messages: Message[]): void;
      }
    ).updateTotalTokensEstimate(messages);

    expect(chatKit.task?.totalTokens).toBeGreaterThan(0);
    expect(chatKit.task?.totalTokens).toBeLessThan(100);
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
      taskMemory: {
      },
      projectMemory: {
        manager: makeAutoMemoryManager(),
      },
    });

    chatKit.chat.messages = [userMessage(), assistantMessage()];
    setLatestRequestSnapshot(chatKit, 20_000, 0);
    chatKit.chat.finish(assistantMessage());
    await chatKit.drainBackgroundTasksAndSettleMemory();

    const memoryTasks = await Promise.all(
      store.backgroundTasks().map(async (task) => ({
        title: task.title,
        useCase: (await backgroundTaskStateStore.read(task.id))?.useCase,
      })),
    );
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

  it("can disable task-memory while keeping auto-memory enabled", async () => {
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
      projectMemory: {
        manager: makeAutoMemoryManager(),
      },
    });

    chatKit.chat.messages = [userMessage(), assistantMessage()];
    chatKit.chat.finish(assistantMessage());
    await chatKit.drainBackgroundTasksAndSettleMemory();

    const memoryTasks = await Promise.all(
      store.backgroundTasks().map(async (task) => ({
        title: task.title,
        useCase: (await backgroundTaskStateStore.read(task.id))?.useCase,
      })),
    );
    expect(memoryTasks).toEqual([
      {
        title: "[Auto Memory Extraction] Build shared runner",
        useCase: "auto-memory",
      },
    ]);
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
      taskMemory: {
        stateStore: taskMemoryStateStore,
      },
    });

    chatKit.chat.messages = [userMessage(), assistantMessage()];
    setLatestRequestSnapshot(chatKit, 20_000, 0);
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

function setLatestRequestSnapshot(
  chatKit: LiveChatKit<FakeChat>,
  systemPromptTokens: number,
  toolsTokens: number,
) {
  (
    chatKit as unknown as {
      latestRequestSnapshot: {
        systemPrompt: string;
        systemPromptTokens: number;
        toolsTokens: number;
      };
    }
  ).latestRequestSnapshot = {
    systemPrompt: "",
    systemPromptTokens,
    toolsTokens,
  };
}

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
  private readonly onError: ChatOnErrorCallback;

  constructor(init: ChatInit<Message>) {
    this.messages = init.messages ?? [];
    this.onFinish = init.onFinish ?? (() => {});
    this.onError = init.onError ?? (() => {});
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

  fail(error: Error) {
    this.onError(error);
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

function makeAutoMemoryManager() {
  return {
    readContext: vi.fn(async () => autoMemoryContext),
    writeTaskTranscript: vi.fn(async () => ({
      transcriptDir: autoMemoryContext.transcriptDir,
      filename: "parent.md",
    })),
    beginDreamRun: vi.fn(async () => undefined),
    finishDreamRun: vi.fn(async () => undefined),
    clearProjectMemory: vi.fn(async () => undefined),
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
    if (event.name === "v1.ChatStreamFailed") {
      this.commitChatStreamFailed(event.args);
      return;
    }
    if (event.name === "v1.UpdateTotalTokens") {
      this.commitUpdateTotalTokens(event.args);
      return;
    }
    if (event.name === "v1.ToolsExecutionFinished") {
      this.commitToolsExecutionFinished(event.args);
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

  taskMessages(taskId: string) {
    return this.messages.get(taskId) ?? [];
  }

  setTaskMessages(taskId: string, messages: Message[]) {
    this.messages.set(taskId, messages);
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

  private commitChatStreamFailed(args: Record<string, unknown>) {
    const id = args.id as string;
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Unknown task ${id}`);

    const message = args.data as Message | null;
    const updatedAt = args.updatedAt as Date;
    this.tasks.set(task.id, {
      ...task,
      status: "failed",
      updatedAt,
    });
    if (message) {
      this.messages.set(id, [
        ...(this.messages.get(id) ?? []).filter((item) => item.id !== message.id),
        message,
      ]);
    }
  }

  private commitUpdateTotalTokens(args: Record<string, unknown>) {
    const id = args.id as string;
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Unknown task ${id}`);

    this.tasks.set(task.id, {
      ...task,
      totalTokens: args.totalTokens as number,
      updatedAt: args.updatedAt as Date,
    });
  }

  private commitToolsExecutionFinished(args: Record<string, unknown>) {
    const id = args.id as string;
    const parts = args.parts as Message["parts"];
    const duration = Duration.toMillis(args.duration as Duration.Duration);
    for (const [taskId, messages] of this.messages) {
      if (!messages.some((message) => message.id === id)) continue;
      this.messages.set(
        taskId,
        messages.map((message) =>
          message.id === id
            ? ({
                ...message,
                parts,
                metadata: {
                  ...message.metadata,
                  totalToolsExecutionDuration:
                    (message.metadata?.kind === "assistant"
                      ? (message.metadata.totalToolsExecutionDuration ?? 0)
                      : 0) + duration,
                },
              } as Message)
            : message,
        ),
      );
      return;
    }
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
      totalTokens: 20_000,
    },
  } as unknown as Message;
}

function assistantUserInputToolMessage(
  type: string,
  toolCallId: string,
  input: unknown,
): Message {
  return {
    id: "assistant-user-input-tool",
    role: "assistant",
    parts: [
      { type: "step-start" },
      {
        type,
        toolCallId,
        state: "input-available",
        input,
      },
    ],
  } as unknown as Message;
}

function blankAssistantMessage(): Message {
  return {
    id: "assistant-blank",
    role: "assistant",
    parts: [],
  } as unknown as Message;
}

function assistantReadFileMessage(
  state: "input-streaming" | "input-available",
): Message {
  return {
    id: "assistant-read-file",
    role: "assistant",
    parts: [
      {
        type: "tool-readFile",
        toolCallId: "call-read-file",
        state,
        input: { path: "README.md" },
      },
    ],
  } as unknown as Message;
}
