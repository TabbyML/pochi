import type { BackgroundTaskState } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import {
  TaskExecutor,
  type RunningTaskAdaptor,
} from "../task-executor";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockState = vi.hoisted(() => ({
  instances: [] as Array<{
    taskId: string;
    chat: { sendMessageCalls: number };
  }>,
}));

vi.mock("@getpochi/livekit/node", () => {
  class MockChat {
    messages: Message[];
    sendMessageCalls = 0;

    constructor(
      messages: Message[],
      private readonly onSendMessage: () => void,
    ) {
      this.messages = structuredClone(messages);
    }

    async stop() {}

    appendOrReplaceMessage(message: Message) {
      const index = this.messages.findIndex((m) => m.id === message.id);
      if (index === -1) {
        this.messages.push(message);
      } else {
        this.messages[index] = structuredClone(message);
      }
    }

    async addToolOutput({
      toolCallId,
      output,
    }: {
      tool: string;
      toolCallId: string;
      output: unknown;
    }) {
      const lastMessage = this.messages.at(-1);
      if (!lastMessage) return;

      this.messages = [
        ...this.messages.slice(0, -1),
        {
          ...lastMessage,
          parts: lastMessage.parts.map((part) =>
            isToolPartForCall(part, toolCallId)
              ? {
                  ...part,
                  state: "output-available",
                  output,
                }
              : part,
          ),
        } as Message,
      ];
    }

    async sendMessage() {
      this.sendMessageCalls += 1;
      this.onSendMessage();
    }
  }

  class MockLiveChatKit {
    readonly taskId: string;
    readonly chat: MockChat;
    private readonly store: FakeLiveKitStore;

    constructor(options: {
      taskId: string;
      store: FakeLiveKitStore;
    }) {
      this.taskId = options.taskId;
      this.store = options.store;
      this.chat = new MockChat(
        this.store.readMessages(this.taskId),
        () => this.store.completeTask(this.taskId),
      );
      mockState.instances.push(this);
    }

    markAsFailed(error: Error) {
      this.store.failTask(this.taskId, error.message);
    }
  }

  return { LiveChatKit: MockLiveChatKit };
});

type TestTask = {
  id: string;
  status: string;
  cwd?: string | null;
  error?: unknown;
  background: boolean;
};

describe("TaskExecutor", () => {
  beforeEach(() => {
    mockState.instances.length = 0;
  });

  it("executes non-completion tools for completed fork-agent messages without sending another model request", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "completed" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([
        makeToolPart("writeToFile", "write", {
          path: "pochi://-/memory.md",
          content: "memory",
        }),
        makeToolPart("attemptCompletion", "done", { result: "done" }),
      ]),
    ]);

    const adaptor = makeAdaptor({
      task: {
        tools: ["writeToFile(pochi://-/memory.md)", "attemptCompletion"],
        useCase: "task-memory",
      },
      executeToolCall: vi.fn(async () => ({ ok: true })),
    });
    const executor = new TaskExecutor({
      store: store as never,
      blobStore: {} as never,
      adaptor,
    });

    await executor.drain();

    expect(adaptor.executeToolCall).toHaveBeenCalledTimes(1);
    expect(adaptor.executeToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task",
        toolName: "writeToFile",
        toolCallId: "write",
      }),
    );
    expect(mockState.instances).toHaveLength(1);
    expect(mockState.instances[0].chat.sendMessageCalls).toBe(0);
    expect(getToolPart(store.readMessages("task").at(-1), "write")).toMatchObject(
      {
        state: "output-available",
        output: { ok: true },
      },
    );

    await executor.drain();
    expect(adaptor.executeToolCall).toHaveBeenCalledTimes(1);
    await executor.dispose();
  });

  it("executes pending tool calls and sends the next model request", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-tool" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([makeToolPart("readFile", "read", { path: "a.ts" })]),
    ]);

    const adaptor = makeAdaptor({
      task: { tools: ["readFile"] },
      executeToolCall: vi.fn(async () => ({ content: "hello" })),
    });
    const executor = new TaskExecutor({
      store: store as never,
      blobStore: {} as never,
      adaptor,
    });

    await executor.drain();

    expect(adaptor.executeToolCall).toHaveBeenCalledTimes(1);
    expect(mockState.instances[0].chat.sendMessageCalls).toBe(1);
    expect(store.readTask("task")?.status).toBe("completed");
    await executor.dispose();
  });

  it("does not start duplicate workers for the same active task", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-tool" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([makeToolPart("readFile", "read", { path: "a.ts" })]),
    ]);
    const pending = deferred<unknown>();
    const executeToolCall = vi.fn(() => pending.promise);
    const adaptor = makeAdaptor({
      task: { tools: ["readFile"] },
      executeToolCall,
    });
    const executor = new TaskExecutor({
      store: store as never,
      blobStore: {} as never,
      adaptor,
    });

    executor.start();
    await waitFor(() => executeToolCall.mock.calls.length === 1);
    store.emit();
    store.emit();

    expect(mockState.instances).toHaveLength(1);
    expect(adaptor.executeToolCall).toHaveBeenCalledTimes(1);

    pending.resolve({ content: "hello" });
    await executor.drain();
    await executor.dispose();
  });

  it("rejects disallowed tool names before invoking the adaptor", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-tool" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([
        makeToolPart("executeCommand", "exec", { command: "echo hi" }),
      ]),
    ]);
    const adaptor = makeAdaptor({
      task: { tools: ["readFile"] },
      executeToolCall: vi.fn(async () => ({ ok: true })),
    });
    const executor = new TaskExecutor({
      store: store as never,
      blobStore: {} as never,
      adaptor,
    });

    await executor.drain();

    expect(adaptor.executeToolCall).not.toHaveBeenCalled();
    expect(getToolPart(store.readMessages("task").at(-1), "exec")).toMatchObject(
      {
        state: "output-available",
        output: {
          error: "Tool executeCommand is not allowed for this task.",
        },
      },
    );
    await executor.dispose();
  });

  it("applies tool policy validation before invoking the adaptor", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-tool", cwd: "/repo" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([
        makeToolPart("writeToFile", "write", {
          path: "/repo/denied.md",
          content: "nope",
        }),
      ]),
    ]);
    const adaptor = makeAdaptor({
      task: { tools: ["writeToFile(/repo/allowed.md)"] },
      executeToolCall: vi.fn(async () => ({ ok: true })),
    });
    const executor = new TaskExecutor({
      store: store as never,
      blobStore: {} as never,
      adaptor,
    });

    await executor.drain();

    expect(adaptor.executeToolCall).not.toHaveBeenCalled();
    expect(
      String(
        (getToolPart(store.readMessages("task").at(-1), "write")?.output as {
          error?: string;
        })?.error,
      ),
    ).toContain("not allowed");
    await executor.dispose();
  });
});

class FakeLiveKitStore {
  readonly storeId = "test-store";
  private readonly tasks = new Map<string, TestTask>();
  private readonly messages = new Map<string, Message[]>();
  private readonly subscribers = new Set<() => void>();

  constructor(tasks: TestTask[]) {
    for (const task of tasks) {
      this.tasks.set(task.id, task);
    }
  }

  subscribe(_query: unknown, callback: () => void) {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  query(query: unknown) {
    if (!isQuery(query)) return undefined;
    if (query.label === "runnableTasks") {
      return this.readRunnableTasks();
    }
    if (query.label === "task") {
      return this.readTask(readQueryTaskId(query));
    }
    if (query.label === "messages") {
      return this.readMessages(readQueryTaskId(query)).map((message) => ({
        data: message,
      }));
    }
    return undefined;
  }

  commit(event: unknown) {
    if (!isEvent(event) || event.name !== "v1.UpdateMessages") return;
    for (const message of event.args.messages as Message[]) {
      this.upsertMessage(message);
    }
    this.emit();
  }

  readRunnableTasks() {
    return [...this.tasks.values()].filter(
      (task) =>
        task.background &&
        ["pending-model", "pending-tool", "completed"].includes(task.status),
    );
  }

  readTask(taskId: string) {
    return this.tasks.get(taskId);
  }

  readMessages(taskId: string) {
    return this.messages.get(taskId) ?? [];
  }

  setMessages(taskId: string, messages: Message[]) {
    this.messages.set(taskId, structuredClone(messages));
  }

  completeTask(taskId: string) {
    const task = this.readTask(taskId);
    if (!task) return;
    this.tasks.set(taskId, { ...task, status: "completed" });
    this.emit();
  }

  failTask(taskId: string, message: string) {
    const task = this.readTask(taskId);
    if (!task) return;
    this.tasks.set(taskId, {
      ...task,
      status: "failed",
      error: { kind: "InternalError", message },
    });
    this.emit();
  }

  emit() {
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }

  private upsertMessage(message: Message) {
    for (const [taskId, messages] of this.messages) {
      const index = messages.findIndex((m) => m.id === message.id);
      if (index === -1) continue;
      this.messages.set(taskId, [
        ...messages.slice(0, index),
        structuredClone(message),
        ...messages.slice(index + 1),
      ]);
      return;
    }
  }
}

function makeAdaptor({
  task,
  executeToolCall,
}: {
  task: BackgroundTaskState;
  executeToolCall: RunningTaskAdaptor["executeToolCall"];
}) {
  return {
    getRequestGetters: () => ({
      getLLM: () =>
        ({
          id: "test",
          type: "openai",
          modelId: "test-model",
          contextWindow: 128_000,
          maxOutputTokens: 4_096,
        }) as never,
    }),
    readTaskState: () => task,
    executeToolCall,
  } satisfies RunningTaskAdaptor;
}

function makeTask({
  id,
  status,
  cwd = "/repo",
}: {
  id: string;
  status: string;
  cwd?: string;
}): TestTask {
  return {
    id,
    cwd,
    background: true,
    status,
    error: null,
  };
}

function makeAssistantMessage(parts: Message["parts"]): Message {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    parts,
  } as Message;
}

function makeToolPart(toolName: string, toolCallId: string, input: unknown) {
  return {
    type: `tool-${toolName}`,
    toolCallId,
    state: "input-available",
    input,
  } as Message["parts"][number];
}

function getToolPart(message: Message | undefined, toolCallId: string) {
  return message?.parts.find((part) => isToolPartForCall(part, toolCallId)) as
    | (Message["parts"][number] & { output?: unknown })
    | undefined;
}

function isToolPartForCall(part: Message["parts"][number], toolCallId: string) {
  return (
    typeof part === "object" &&
    part !== null &&
    "toolCallId" in part &&
    part.toolCallId === toolCallId
  );
}

function isQuery(value: unknown): value is { label: string; hash: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "label" in value &&
    "hash" in value &&
    typeof value.label === "string" &&
    typeof value.hash === "string"
  );
}

function readQueryTaskId(query: { hash: string }) {
  return query.hash.slice(query.hash.lastIndexOf("-") + 1);
}

function isEvent(value: unknown): value is {
  name: string;
  args: Record<string, unknown>;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "args" in value &&
    typeof value.name === "string" &&
    typeof value.args === "object" &&
    value.args !== null
  );
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
  for (let i = 0; i < 20; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for predicate");
}
