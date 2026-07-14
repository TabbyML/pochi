import {
  TaskMemoryFileUri,
  type AutoMemoryContext,
  type AutoMemoryTaskState,
  type BackgroundTaskState,
  type TaskMemoryState,
} from "@getpochi/common";
import { events } from "../../../livestore/default-schema";
import type { LiveKitStore, Message, Task } from "../../../types";
import type { ForkAgent } from "../../fork-agent";
import { AutoMemoryAdaptor, type AutoMemoryManager } from "../auto-memory";
import { TaskMemoryAdaptor } from "../task-memory";
import { describe, expect, it, vi } from "vitest";

describe("task-memory adaptor", () => {
  it("starts extraction from stream-finish usage before the main task completes", async () => {
    const store = new FakeStore([
      makeTask({
        id: "parent",
        status: "pending-tool",
        background: false,
        title: "Build shared runner",
      }),
    ]);
    const stateStore = new BackgroundTaskStateStore();
    const backgroundTask = createTestBackgroundTask({
      store: store as unknown as LiveKitStore,
      stateStore,
    });
    const adaptor = new TaskMemoryAdaptor({
      store: store as unknown as LiveKitStore,
      backgroundTask,
      parentTaskId: "parent",
      parentCwd: "/repo",
    });

    await expect(
      adaptor.update({
        messages: makeParentMessages(),
        contextWindowUsage: usage(20_000),
      }),
    ).resolves.toBe(true);

    const [task] = store.backgroundTasks();
    expect(task).toMatchObject({
      background: true,
      status: "pending-model",
      title: "[Task Memory Extraction] Build shared runner",
    });
    expect(await stateStore.read(task.id)).toMatchObject({
      parentTaskId: "parent",
      useCase: "task-memory",
    });
  });

  it("uses the trailing assistant turn as the extraction boundary", async () => {
    const store = new FakeStore([
      makeTask({
        id: "parent",
        status: "pending-tool",
        background: false,
        title: "Build shared runner",
      }),
    ]);
    const stateStore = new BackgroundTaskStateStore();
    let taskMemoryState: TaskMemoryState | undefined;
    const adaptor = new TaskMemoryAdaptor({
      store: store as unknown as LiveKitStore,
      backgroundTask: createTestBackgroundTask({
        store: store as unknown as LiveKitStore,
        stateStore,
      }),
      taskMemoryStateStore: {
        get: () => taskMemoryState,
        set: (state) => {
          taskMemoryState = state;
        },
      },
      parentTaskId: "parent",
      parentCwd: "/repo",
    });

    await expect(
      adaptor.update({
        messages: [
          {
            id: "read-turn",
            role: "assistant",
            parts: [
              {
                type: "tool-readFile",
                toolCallId: "read-1",
                state: "input-available",
                input: { path: "src/file.ts" },
              },
            ],
          },
        ] as Message[],
        contextWindowUsage: usage(20_000),
      }),
    ).resolves.toBe(true);

    expect(taskMemoryState).toMatchObject({
      isExtracting: true,
      pendingExtractionMessageId: "read-turn",
    });
  });

  it("settles extraction after the background task wait resolves", async () => {
    const taskDone = deferred<void>();
    const waitForBackgroundTask = vi.fn(() => taskDone.promise);
    const store = new FakeStore([
      makeTask({
        id: "parent",
        status: "pending-tool",
        background: false,
        title: "Build shared runner",
      }),
    ]);
    const stateStore = new BackgroundTaskStateStore();
    const backgroundTask = createTestBackgroundTask({
      store: store as unknown as LiveKitStore,
      stateStore,
      waitForTaskDone: waitForBackgroundTask,
    });
    let taskMemoryState: TaskMemoryState | undefined;
    const adaptor = new TaskMemoryAdaptor({
      store: store as unknown as LiveKitStore,
      backgroundTask,
      taskMemoryStateStore: {
        get: () => taskMemoryState,
        set: (state) => {
          taskMemoryState = state;
        },
      },
      parentTaskId: "parent",
      parentCwd: "/repo",
    });

    await adaptor.update({
      messages: makeParentMessages(),
      contextWindowUsage: usage(20_000),
    });

    const [task] = store.backgroundTasks();
    expect(waitForBackgroundTask).toHaveBeenCalledWith(task.id);

    store.updateTaskStatus(task.id, "failed");
    taskDone.resolve();

    await waitFor(() => taskMemoryState?.isExtracting === false);
    expect(taskMemoryState).toMatchObject({
      isExtracting: false,
      activeTaskId: undefined,
    });
  });

  it("marks extraction successful when the background task writes memory", async () => {
    const store = new FakeStore([
      makeTask({
        id: "parent",
        status: "pending-tool",
        background: false,
        title: "Build shared runner",
      }),
    ]);
    const stateStore = new BackgroundTaskStateStore();
    let taskMemoryState: TaskMemoryState | undefined;
    const adaptor = new TaskMemoryAdaptor({
      store: store as unknown as LiveKitStore,
      backgroundTask: createTestBackgroundTask({
        store: store as unknown as LiveKitStore,
        stateStore,
      }),
      taskMemoryStateStore: {
        get: () => taskMemoryState,
        set: (state) => {
          taskMemoryState = state;
        },
      },
      parentTaskId: "parent",
      parentCwd: "/repo",
    });

    await adaptor.update({
      messages: makeParentMessages(),
      contextWindowUsage: usage(20_000),
    });

    const activeTaskId = taskMemoryState?.activeTaskId;
    store.setMessages(activeTaskId ?? "", [
      {
        id: "write-memory",
        role: "assistant",
        parts: [
          {
            type: "tool-writeToFile",
            toolCallId: "write-1",
            state: "output-available",
            input: { path: TaskMemoryFileUri, content: "# Session Title" },
            output: { success: true },
          },
        ],
      },
    ] as Message[]);

    await expect(adaptor.settle()).resolves.toBe(true);
    expect(taskMemoryState).toMatchObject({
      isExtracting: false,
      extractionCount: 1,
      activeTaskId: undefined,
    });
  });
});

describe("auto-memory adaptor", () => {
  it("starts an extraction background task after the main task completes", async () => {
    const store = new FakeStore([
      makeTask({
        id: "parent",
        status: "completed",
        background: false,
        title: "Build shared runner",
      }),
    ]);
    const stateStore = new BackgroundTaskStateStore();
    const backgroundTask = createTestBackgroundTask({
      store: store as unknown as LiveKitStore,
      stateStore,
    });
    const adaptor = new AutoMemoryAdaptor({
      store: store as unknown as LiveKitStore,
      backgroundTask,
      parentTaskId: "parent",
      parentCwd: "/repo",
      manager: makeAutoMemoryManager(),
    });

    await expect(
      adaptor.update({
        messages: makeParentMessages(),
        status: "completed",
      }),
    ).resolves.toBe(true);

    const [task] = store.backgroundTasks();
    expect(task).toMatchObject({
      background: true,
      status: "pending-model",
      title: "[Auto Memory Extraction] Build shared runner",
    });
    expect(await stateStore.read(task.id)).toMatchObject({
      parentTaskId: "parent",
      useCase: "auto-memory",
      tools: [
        "readFile(/repo/.pochi/memory/**)",
        "readFile(/repo/.pochi/transcripts/**)",
        "listFiles(/repo/.pochi/memory/**)",
        "listFiles(/repo/.pochi/transcripts/**)",
        "globFiles(/repo/.pochi/memory/**)",
        "globFiles(/repo/.pochi/transcripts/**)",
        "searchFiles(/repo/.pochi/memory/**)",
        "searchFiles(/repo/.pochi/transcripts/**)",
        "writeToFile(/repo/.pochi/memory/**)",
        "applyDiff(/repo/.pochi/memory/**)",
        "attemptCompletion",
      ],
    });
  });

  it("reads context with force so extraction runs while injection is disabled", async () => {
    const store = new FakeStore([
      makeTask({
        id: "parent",
        status: "completed",
        background: false,
        title: "Build shared runner",
      }),
    ]);
    // Simulate the host gating injection: readContext only resolves when the
    // caller explicitly bypasses the enabled preference via `force`.
    const readContext = vi.fn(
      async (cwdOrOptions?: string | { force?: boolean }) => {
        const force =
          typeof cwdOrOptions === "object" ? cwdOrOptions?.force : false;
        return force ? autoMemoryContext : undefined;
      },
    );
    const manager = makeAutoMemoryManager({ readContext });
    const adaptor = new AutoMemoryAdaptor({
      store: store as unknown as LiveKitStore,
      backgroundTask: createTestBackgroundTask({
        store: store as unknown as LiveKitStore,
        stateStore: new BackgroundTaskStateStore(),
      }),
      parentTaskId: "parent",
      parentCwd: "/repo",
      manager,
    });

    await expect(
      adaptor.update({
        messages: makeParentMessages(),
        status: "completed",
      }),
    ).resolves.toBe(true);

    expect(readContext).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: "/repo", force: true }),
    );
    expect(store.backgroundTasks()).toHaveLength(1);
  });

  it("records direct memory writes without starting extraction", async () => {
    const store = new FakeStore([
      makeTask({
        id: "parent",
        status: "completed",
        background: false,
        title: "Build shared runner",
      }),
    ]);
    let autoMemoryState: AutoMemoryTaskState | undefined;
    const manager = makeAutoMemoryManager({
      beginDreamRun: vi.fn(async () => undefined),
    });
    const adaptor = new AutoMemoryAdaptor({
      store: store as unknown as LiveKitStore,
      backgroundTask: createTestBackgroundTask({
        store: store as unknown as LiveKitStore,
        stateStore: new BackgroundTaskStateStore(),
      }),
      autoMemoryStateStore: {
        get: () => autoMemoryState,
        set: (state) => {
          autoMemoryState = state;
        },
      },
      parentTaskId: "parent",
      parentCwd: "/repo",
      manager,
    });

    await expect(
      adaptor.update({
        messages: [
          {
            id: "write-memory",
            role: "assistant",
            parts: [
              {
                type: "tool-writeToFile",
                toolCallId: "write",
                state: "output-available",
                input: { path: ".pochi/memory/index.md" },
                output: { success: true },
              },
            ],
          },
        ] as Message[],
        status: "completed",
      }),
    ).resolves.toBe(false);

    expect(store.backgroundTasks()).toHaveLength(0);
    expect(autoMemoryState).toMatchObject({
      lastExtractionMessageCount: 1,
      isExtracting: false,
    });
    expect(manager.beginDreamRun).toHaveBeenCalledTimes(1);
  });

  it("writes a sanitized bounded transcript", async () => {
    const store = new FakeStore([
      makeTask({
        id: "parent",
        status: "completed",
        background: false,
        title: "Build shared runner",
      }),
    ]);
    const manager = makeAutoMemoryManager();
    const adaptor = new AutoMemoryAdaptor({
      store: store as unknown as LiveKitStore,
      backgroundTask: createTestBackgroundTask({
        store: store as unknown as LiveKitStore,
        stateStore: new BackgroundTaskStateStore(),
      }),
      parentTaskId: "parent",
      parentCwd: "/repo",
      manager,
    });

    await adaptor.update({
      messages: [
        {
          id: "u1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        },
        {
          id: "a1",
          role: "assistant",
          parts: [
            {
              type: "tool-readFile",
              toolCallId: "read",
              state: "output-available",
              input: { path: "a.ts" },
              output: { content: "source" },
            },
          ],
        },
      ] as Message[],
      status: "completed",
    });

    const transcript = vi.mocked(manager.writeTaskTranscript).mock.calls[0]?.[0]
      .transcript;
    expect(transcript).toContain("### 1. user");
    expect(transcript).toContain("### 2. assistant");
    expect(transcript).toContain("\"type\":\"tool-readFile\"");
    expect(transcript.length).toBeLessThan(24_000);
  });

  it("starts a dream background task after extraction completes and finishes the dream lock", async () => {
    const store = new FakeStore([
      makeTask({
        id: "parent",
        status: "completed",
        background: false,
        updatedAt: new Date(1_000),
      }),
    ]);
    const stateStore = new BackgroundTaskStateStore();
    const manager = makeAutoMemoryManager({
      beginDreamRun: vi.fn(async ({ currentTranscript }) => ({
        context: autoMemoryContext,
        token: "dream-token",
        previousLastDreamAt: 0,
        sessionCount: 1,
        reason: "sessions" as const,
        candidates: currentTranscript ? [currentTranscript] : [],
      })),
    });
    const backgroundTask = createTestBackgroundTask({
      store: store as unknown as LiveKitStore,
      stateStore,
    });
    const adaptor = new AutoMemoryAdaptor({
      store: store as unknown as LiveKitStore,
      backgroundTask,
      parentTaskId: "parent",
      parentCwd: "/repo",
      manager,
    });

    await adaptor.update({
      messages: makeParentMessages(),
      status: "completed",
    });
    const [extractionTask] = store.backgroundTasks();
    store.updateTaskStatus(extractionTask.id, "completed");

    await expect(adaptor.settleAndMaybeContinue()).resolves.toBe(true);

    const tasksWithState = await Promise.all(
      store.backgroundTasks().map(async (task) => ({
        task,
        state: await stateStore.read(task.id),
      })),
    );
    const dreamTask = tasksWithState.find(({ state }) => {
      return state?.useCase === "auto-memory-dream";
    })?.task;
    expect(dreamTask).toMatchObject({
      background: true,
      status: "pending-model",
      title: "[Auto Memory Dream]",
    });
    expect(manager.beginDreamRun).toHaveBeenCalledTimes(1);

    store.updateTaskStatus(dreamTask?.id ?? "", "completed");
    await expect(adaptor.settleAndMaybeContinue()).resolves.toBe(false);

    expect(manager.finishDreamRun).toHaveBeenCalledWith({
      memoryDir: autoMemoryContext.memoryDir,
      token: "dream-token",
      previousLastDreamAt: 0,
      success: true,
    });
  });
});

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

class BackgroundTaskStateStore {
  private readonly states = new Map<string, BackgroundTaskState>();

  read(taskId: string) {
    return this.states.get(taskId);
  }

  set(taskId: string, state: BackgroundTaskState) {
    this.states.set(taskId, state);
  }
}

function makeAutoMemoryManager(
  overrides: Partial<AutoMemoryManager> = {},
): AutoMemoryManager {
  return {
    readContext: vi.fn(async () => autoMemoryContext),
    writeTaskTranscript: vi.fn(async () => ({
      transcriptDir: autoMemoryContext.transcriptDir,
      filename: "parent.md",
    })),
    beginDreamRun: vi.fn(async () => undefined),
    finishDreamRun: vi.fn(async () => undefined),
    clearProjectMemory: vi.fn(async () => undefined),
    ...overrides,
  };
}

function createTestBackgroundTask({
  store,
  stateStore,
  waitForTaskDone,
}: {
  store: LiveKitStore;
  stateStore: BackgroundTaskStateStore;
  waitForTaskDone?: (taskId: string) => Promise<void>;
}) {
  return {
    startForkAgent: async (agent: ForkAgent<Message>) => {
      const taskId = crypto.randomUUID();
      await stateStore.set(taskId, {
        parentTaskId: agent.parentTaskId,
        tools: agent.tools,
        useCase: agent.label,
        baselineStepCount: agent.baselineStepCount,
      });
      store.commit(
        events.taskInited({
          id: taskId,
          cwd: agent.cwd,
          background: true,
          createdAt: new Date(),
          initMessages: agent.initMessages,
          initTitle: agent.initTitle,
        }),
      );
      return {
        taskId,
        cwd: agent.cwd,
        label: agent.label,
      };
    },
    waitForTaskDone,
  };
}

class FakeStore {
  readonly storeId = "cli-test-store";
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
    throw new Error(`Unsupported query ${query.label ?? query.hash}`);
  }

  commit(event: { name: string; args: Record<string, unknown> }) {
    if (event.name !== "v1.TaskInited") {
      throw new Error(`Unsupported event ${event.name}`);
    }

    const id = event.args.id as string;
    const initMessages = (event.args.initMessages ?? []) as Message[];
    const createdAt = event.args.createdAt as Date;
    this.tasks.set(
      id,
      makeTask({
        id,
        cwd: event.args.cwd as string | undefined,
        background: event.args.background as boolean | undefined,
        status: initMessages.length > 0 ? "pending-model" : "pending-input",
        title: event.args.initTitle as string | undefined,
        createdAt,
        updatedAt: createdAt,
      }),
    );
    this.messages.set(id, initMessages);
  }

  backgroundTasks() {
    return [...this.tasks.values()].filter((task) => task.background);
  }

  updateTaskStatus(taskId: string, status: Task["status"]) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Unknown task ${taskId}`);
    this.tasks.set(taskId, { ...task, status });
  }

  setMessages(taskId: string, messages: Message[]) {
    if (!this.tasks.has(taskId)) throw new Error(`Unknown task ${taskId}`);
    this.messages.set(taskId, messages);
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

function makeParentMessages(): Message[] {
  return [
    {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "please implement it" }],
    },
    {
      id: "assistant-1",
      role: "assistant",
      parts: [{ type: "text", text: "done" }],
    },
  ] as Message[];
}

function usage(tokens: number) {
  return {
    system: tokens,
    tools: 0,
    messages: 0,
    files: 0,
    toolResults: 0,
    projectMemory: 0,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function waitFor(predicate: () => boolean) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > 1_000) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
