import { makeJobStore } from "../../../background-job/__tests__/test-store";
import {
  BackgroundJobManager,
  type BackgroundCommandSource,
} from "../../../background-job/manager";
import type { Task } from "../../../types";
import { expect, it, vi } from "vitest";
import { TaskExecutor } from "../task-executor";
import { InMemoryChat } from "../in-memory-chat";
import { LiveChatKit } from "../../../chat/live-chat-kit";
import type { Message } from "../../../types";

class ReviewStore {
  storeId = "review-store";
  task = {
    id: "child",
    parentId: "parent",
    background: true,
    cwd: "/repo",
    status: "pending-tool",
    error: null as unknown,
  };
  messages: Message[] = [];
  listeners = new Set<() => void>();
  query(query: { label: string }) {
    if (query.label === "backgroundTasks") return [];
    if (query.label === "task") return this.task;
    if (query.label === "messages")
      return structuredClone(this.messages).map((data) => ({ data }));
    if (query.label === "runnableTasks")
      return ["pending-model", "pending-tool"].includes(this.task.status)
        ? [this.task]
        : [];
    return undefined;
  }
  subscribe(_query: unknown, listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  commit(event: { name: string; args: any }) {
    if (event.name === "v1.TaskFailed") {
      this.task.status = "failed";
      this.task.error = event.args.error;
    } else if (event.name === "v1.ToolsExecutionFinished") {
      this.messages = this.messages.map((message) =>
        message.id === event.args.id
          ? { ...message, parts: structuredClone(event.args.parts) }
          : message,
      );
    }
    for (const listener of this.listeners) listener();
  }
}

const getters = { getLLM: () => ({ id: "review" }) as never };
function tool(
  toolName: string,
  toolCallId: string,
  input: unknown,
): Message["parts"][number] {
  return {
    type: `tool-${toolName}`,
    toolCallId,
    input,
    state: "input-available",
  } as Message["parts"][number];
}
function assistant(parts: Message["parts"]): Message {
  return {
    id: "response",
    role: "assistant",
    parts,
    metadata: { kind: "assistant", finishReason: "stop" },
  } as Message;
}

it("save each finished command before a later command finishes", async () => {
  const store = new ReviewStore();
  store.messages = [
    assistant([
      tool("executeCommand", "first", { command: "echo first >> changes.txt" }),
      tool("executeCommand", "second", { command: "sleep 60" }),
    ]),
  ];
  let secondStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    secondStarted = resolve;
  });
  let child!: LiveChatKit<InMemoryChat>;
  const executor = new TaskExecutor({
    manager: BackgroundJobManager.forStore(store as never),
    store: store as never,
    blobStore: {} as never,
    readTaskState: () => ({}),
    createChatKit: (options) => {
      child = new LiveChatKit({
        ...options,
        chatClass: InMemoryChat,
        isSubTask: true,
      });
      return child;
    },
    adaptor: {
      getRequestGetters: () => getters,
      executeToolCall: async ({ toolCallId, abortSignal }) => {
        if (toolCallId === "first") return { output: "done" };
        secondStarted();
        return new Promise((resolve) =>
          abortSignal.addEventListener(
            "abort",
            () => resolve({ error: "aborted" }),
            { once: true },
          ),
        );
      },
    },
  });
  try {
    executor.start();
    await started;
    expect(child.chat.messages[0].parts[0]).toMatchObject({
      state: "output-available",
    });
    // This is the snapshot a newly opened Webview would load if the old one disappears now.
    expect(store.messages[0].parts[0]).toMatchObject({
      state: "output-available",
    });
  } finally {
    await executor.dispose();
  }
});

it.each(["pending-model", "pending-tool"] as const)(
  "resumes an agent from its persisted %s task status",
  async (status) => {
    const data = makeJobStore();
    data.tasks.set("child", {
      id: "child",
      parentId: "parent",
      background: true,
      status,
      cwd: "/repo",
    } as Task);
    const response = assistant([{ type: "text", text: "Still working." }]);
    data.messages.set("child", [response]);
    const manager = BackgroundJobManager.forStore(data.store);
    manager.registerTask("child", { parentTaskId: "parent" });
    await manager.watchTask("parent");
    let messages = [response];
    const send = vi.fn(async () => {
      messages = [
        assistant([tool("attemptCompletion", "done", { result: "done" })]),
      ];
      data.messages.set("child", messages);
      data.tasks.set("child", {
        ...data.tasks.get("child"),
        status: "completed",
      } as Task);
    });
    const executor = new TaskExecutor({
      manager,
      store: data.store,
      blobStore: {} as never,
      readTaskState: () => ({ parentTaskId: "parent" }),
      adaptor: { getRequestGetters: () => getters, executeToolCall: vi.fn() },
      createChatKit: () => ({
        chat: {
          get messages() {
            return messages;
          },
          stop: async () => {},
          sendMessage: send,
          addToolOutput: vi.fn(),
          appendOrReplaceMessage: (message) => {
            messages = [...messages, message];
          },
        },
        persistToolOutput() {},
        flushBackgroundJobNotifications() {
          return false;
        },
        subscribeBackgroundJobs() {
          return () => {};
        },
        markStartToolsExecution() {},
        markEndToolsExecution() {},
        markAsFailed: vi.fn(),
      }),
    });
    manager.setExecutor(executor);
    try {
      expect(manager.getPendingNotifications("parent")).toEqual([]);
      await executor.drain();
      expect(send).toHaveBeenCalledOnce();
      expect(manager.getPendingNotifications("parent")).toEqual([
        expect.objectContaining({ status: "completed" }),
      ]);
    } finally {
      await manager.dispose();
    }
  },
);

it.each(["completed", "failed", "pending-input"] as const)(
  "does not resume a task with persisted %s status",
  async (status) => {
    const data = makeJobStore();
    data.tasks.set("child", {
      id: "child",
      parentId: "parent",
      background: true,
      status,
    } as Task);
    const manager = BackgroundJobManager.forStore(data.store);
    const createChatKit = vi.fn(() => {
      throw new Error("Task should not restart");
    });
    const executor = new TaskExecutor({
      manager,
      store: data.store,
      blobStore: {} as never,
      readTaskState: () => ({ parentTaskId: "parent" }),
      adaptor: { getRequestGetters: () => getters, executeToolCall: vi.fn() },
      createChatKit,
    });
    manager.setExecutor(executor);
    try {
      await executor.drain();
      expect(createChatKit).not.toHaveBeenCalled();
      expect(data.tasks.get("child")?.status).toBe(status);
      expect(data.commit).not.toHaveBeenCalled();
      expect(manager.getTaskStatus("child")).toBe(
        status === "failed" ? "failed" : "completed",
      );
    } finally {
      await manager.dispose();
    }
  },
);

it("preserves the saved task status when its Webview is disposed during a response", async () => {
  const data = makeJobStore();
  data.tasks.set("child", {
    id: "child",
    parentId: "parent",
    background: true,
    status: "pending-model",
    cwd: "/repo",
  } as Task);
  data.messages.set("child", [
    { id: "prompt", role: "user", parts: [{ type: "text", text: "Work" }] },
  ]);
  const manager = BackgroundJobManager.forStore(data.store);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const responseStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let messages = data.messages.get("child") ?? [];
  const executor = new TaskExecutor({
    manager,
    store: data.store,
    blobStore: {} as never,
    readTaskState: () => ({ parentTaskId: "parent" }),
    adaptor: { getRequestGetters: () => getters, executeToolCall: vi.fn() },
    createChatKit: () => ({
      chat: {
        get messages() {
          return messages;
        },
        stop: async () => {
          release();
        },
        addToolOutput: vi.fn(),
        appendOrReplaceMessage: (message) => {
          messages = [...messages, message];
        },
        sendMessage: async () => {
          messages = [assistant([{ type: "text", text: "Still working" }])];
          data.tasks.set("child", {
            ...data.tasks.get("child"),
            status: "pending-input",
          } as Task);
          started();
          await gate;
        },
      },
      persistToolOutput() {},
      flushBackgroundJobNotifications() {
        return false;
      },
      subscribeBackgroundJobs() {
        return () => {};
      },
      markStartToolsExecution() {},
      markEndToolsExecution() {},
      markAsFailed: vi.fn(),
    }),
  });
  manager.setExecutor(executor);
  executor.start();
  await responseStarted;
  await manager.dispose();
  expect(data.tasks.get("child")).toMatchObject({ status: "pending-input" });
  expect(
    data.commit.mock.calls.some(([event]) => event.name === "v1.TaskFailed"),
  ).toBe(false);
});

function backgroundAgent(initialMessage: Message) {
  const data = makeJobStore();
  data.tasks.set("child", {
    id: "child",
    parentId: "parent",
    background: true,
    status: "pending-model",
    cwd: "/repo",
  } as Task);
  data.messages.set("child", [initialMessage]);
  const manager = BackgroundJobManager.forStore(data.store);
  manager.registerTask("child", { parentTaskId: "parent" });
  let publishCommands!: Parameters<
    BackgroundCommandSource["observeCommands"]
  >[0];
  const publishNotifications = new Map<
    string,
    Parameters<BackgroundCommandSource["observeNotifications"]>[1]
  >();
  const running = {
    "bgjob-cmd-child": { taskId: "child", command: "test", isVisible: false },
    "bgjob-cmd-sibling": {
      taskId: "sibling",
      command: "test",
      isVisible: false,
    },
  };
  const acknowledge = vi.fn(async () => {});
  const kill = vi.fn(async (_id: string) => {});
  manager.connect({
    kill,
    observeCommands: async (update) => {
      publishCommands = update;
      update(running);
      return { dispose: vi.fn() };
    },
    observeNotifications: async (taskId, update) => {
      publishNotifications.set(taskId, update);
      update([]);
      return { dispose: vi.fn(), acknowledge };
    },
  });
  const requests: Message[][] = [];
  const send = vi.fn();
  const executor = new TaskExecutor({
    manager,
    store: data.store,
    blobStore: {} as never,
    readTaskState: () => ({ parentTaskId: "parent" }),
    adaptor: { getRequestGetters: () => getters, executeToolCall: vi.fn() },
    createChatKit: (options) => {
      data.tasks.set("child", {
        ...data.tasks.get("child"),
        status: initialMessage.parts.some(
          (part) => part.type === "tool-attemptCompletion",
        )
          ? "completed"
          : "pending-input",
      } as Task);
      const kit = new LiveChatKit({
        ...options,
        backgroundJobManager: manager,
        chatClass: InMemoryChat,
        isSubTask: true,
      });
      send.mockImplementation(async () => {
        // Use the real request hook while replacing the network response.
        const chat = kit.chat as unknown as {
          onBeforeSnapshotInMakeRequest(options: {
            abortSignal: AbortSignal;
          }): Promise<void>;
        };
        await chat.onBeforeSnapshotInMakeRequest({
          abortSignal: new AbortController().signal,
        });
        requests.push(structuredClone(kit.chat.messages));
        kit.chat.appendOrReplaceMessage({
          ...assistant([
            tool("attemptCompletion", "final", { result: "Done" }),
          ]),
          id: `result-${requests.length}`,
        });
        data.tasks.set("child", {
          ...data.tasks.get("child"),
          status: "completed",
        } as Task);
        data.setMessages("child", kit.chat.messages);
      });
      kit.chat.sendMessage = send;
      return kit;
    },
  });
  manager.setExecutor(executor);
  const completeCommand = () => {
    publishCommands({ "bgjob-cmd-sibling": running["bgjob-cmd-sibling"] });
    publishNotifications.get("child")!([
      {
        kind: "command",
        backgroundJobId: "bgjob-cmd-child",
        notificationId: "bgjob-cmd-child:terminal",
        status: "completed",
        summary: "Command finished",
        outputFile: "/tmp/output",
        finishedAt: 1,
      },
    ]);
  };
  return {
    ...data,
    manager,
    executor,
    requests,
    send,
    completeCommand,
    acknowledge,
    kill,
  };
}

it("returns an unanswered question without waiting for commands or answering it with a notification", async () => {
  const data = backgroundAgent(
    assistant([
      tool("askFollowupQuestion", "question", {
        questions: [{ question: "Continue?" }],
      }),
    ]),
  );
  try {
    await data.manager.watchTask("child");
    data.completeCommand();
    const wait = vi.spyOn(data.manager, "wait");
    await data.executor.drain();
    expect(wait).not.toHaveBeenCalled();
    expect(data.send).not.toHaveBeenCalled();
    expect(data.manager.getPendingNotifications("child")).toHaveLength(1);
    expect(data.acknowledge).not.toHaveBeenCalled();
  } finally {
    await data.manager.dispose();
  }
});

it("keeps the job running after the model finishes and sends its command result exactly once", async () => {
  const data = backgroundAgent(
    assistant([tool("attemptCompletion", "done", { result: "Done" })]),
  );
  const wait = vi.spyOn(data.manager, "wait");
  try {
    data.executor.start();
    await vi.waitFor(() => expect(wait).toHaveBeenCalled());
    expect(data.tasks.get("child")?.status).toBe("completed");
    expect(data.manager.getTaskStatus("child")).toBe("running");
    expect(data.send).not.toHaveBeenCalled();
    data.completeCommand();
    await data.executor.drain();
    expect(data.send).toHaveBeenCalledOnce();
    expect(data.requests[0].at(-1)?.parts).toEqual([
      expect.objectContaining({ type: "data-background-job-notification" }),
    ]);
    expect(data.manager.getTaskStatus("child")).toBe("completed");
    expect(data.manager.getPendingNotifications("child")).toEqual([]);
    expect(data.acknowledge).toHaveBeenCalledOnce();
  } finally {
    await data.manager.dispose();
  }
});

it("sends the plain-text reminder before waiting for background commands", async () => {
  const data = backgroundAgent(
    assistant([{ type: "text", text: "I have started the command." }]),
  );
  const wait = vi.spyOn(data.manager, "wait");
  try {
    data.executor.start();
    await vi.waitFor(() => expect(wait).toHaveBeenCalled());
    expect(data.send).toHaveBeenCalledOnce();
    expect(data.requests[0].at(-1)).toMatchObject({
      role: "user",
      parts: [
        { type: "text", text: expect.stringContaining("<system-reminder>") },
      ],
    });
    data.completeCommand();
    await data.executor.drain();
    expect(data.send).toHaveBeenCalledTimes(2);
    expect(data.manager.getTaskStatus("child")).toBe("completed");
  } finally {
    await data.manager.dispose();
  }
});

it("stops an agent waiting for its command without stopping the sibling command", async () => {
  const data = backgroundAgent(
    assistant([tool("attemptCompletion", "done", { result: "Done" })]),
  );
  const wait = vi.spyOn(data.manager, "wait");
  try {
    await data.manager.watchTask("sibling");
    data.executor.start();
    await vi.waitFor(() => expect(wait).toHaveBeenCalled());
    await data.manager.kill("bgjob-task-child", "parent");
    await data.executor.drain();
    expect(data.kill).toHaveBeenCalledExactlyOnceWith("bgjob-cmd-child");
    expect(data.manager.getTaskStatus("child")).toBe("stopped");
    expect(data.manager.hasPending("sibling")).toBe(true);
    expect(data.send).not.toHaveBeenCalled();
  } finally {
    await data.manager.dispose();
  }
});
