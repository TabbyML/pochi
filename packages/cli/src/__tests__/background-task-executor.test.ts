import type { AutoMemoryContext } from "@getpochi/common";
import type { AutoMemoryManager } from "@getpochi/common/auto-memory/node";
import { type LiveKitStore, type Message, type Task } from "@getpochi/livekit";
import {
  BackgroundTaskStateStore,
  createAutoMemoryCoordinator,
  createTaskMemoryCoordinator,
} from "../background-task-executor";
import { describe, expect, it, vi } from "vitest";

describe("CLI task-memory coordinator", () => {
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
    const coordinator = createTaskMemoryCoordinator({
      store: store as unknown as LiveKitStore,
      stateStore,
      parentTaskId: "parent",
      parentCwd: "/repo",
    });

    await expect(
      coordinator.update({
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
    expect(stateStore.read(task.id)).toMatchObject({
      parentTaskId: "parent",
      useCase: "task-memory",
    });
  });
});

describe("CLI auto-memory coordinator", () => {
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
    const coordinator = createAutoMemoryCoordinator({
      store: store as unknown as LiveKitStore,
      stateStore,
      parentTaskId: "parent",
      parentCwd: "/repo",
      manager: makeAutoMemoryManager(),
    });

    await expect(
      coordinator.update({
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
    expect(stateStore.read(task.id)).toMatchObject({
      parentTaskId: "parent",
      useCase: "auto-memory",
    });
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
      beginDreamRun: vi.fn(async () => ({
        context: autoMemoryContext,
        token: "dream-token",
        previousLastDreamAt: 0,
        sessionCount: 1,
        reason: "sessions" as const,
      })),
    });
    const coordinator = createAutoMemoryCoordinator({
      store: store as unknown as LiveKitStore,
      stateStore,
      parentTaskId: "parent",
      parentCwd: "/repo",
      manager,
    });

    await coordinator.update({
      messages: makeParentMessages(),
      status: "completed",
    });
    const [extractionTask] = store.backgroundTasks();
    store.updateTaskStatus(extractionTask.id, "completed");

    await expect(coordinator.settleAndMaybeContinue()).resolves.toBe(true);

    const dreamTask = store.backgroundTasks().find((task) => {
      return stateStore.read(task.id)?.useCase === "auto-memory-dream";
    });
    expect(dreamTask).toMatchObject({
      background: true,
      status: "pending-model",
      title: "[Auto Memory Dream]",
    });
    expect(manager.beginDreamRun).toHaveBeenCalledTimes(1);

    store.updateTaskStatus(dreamTask?.id ?? "", "completed");
    await expect(coordinator.settleAndMaybeContinue()).resolves.toBe(false);

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

function makeAutoMemoryManager(overrides: Partial<AutoMemoryManager> = {}) {
  return {
    readContext: vi.fn(async () => autoMemoryContext),
    writeTaskTranscript: vi.fn(async () => ({
      transcriptDir: autoMemoryContext.transcriptDir,
      filename: "parent.md",
    })),
    beginDreamRun: vi.fn(async () => undefined),
    finishDreamRun: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as AutoMemoryManager;
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
