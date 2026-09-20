import {
  type BackgroundTaskState,
  type MaybePromise,
  prompts,
} from "@getpochi/common";
import { TaskExecutor, type RunningTaskAdaptor } from "../task-executor";
import type { AbstractChat } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toTaskStatus } from "../../../task";
import type { Message } from "../../../types";

const mockState = vi.hoisted(() => ({
  instances: [] as Array<{
    taskId: string;
    chat: { sendMessageCalls: number };
  }>,
}));

class MockChat {
  messages: Message[];
  sendMessageCalls = 0;

  constructor(
    messages: Message[],
    private readonly onSendMessage: (messages: Message[]) => void,
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
  }: Parameters<AbstractChat<Message>["addToolOutput"]>[0]) {
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
    this.onSendMessage(this.messages);
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
      (messages) => {
        const last = messages.at(-1);
        const completion = makeToolPart("attemptCompletion", "complete", {
          result: "done",
        });
        this.chat.appendOrReplaceMessage(
          last?.role === "assistant"
            ? {
                ...last,
                parts: [...last.parts, { type: "step-start" }, completion],
              }
            : makeAssistantMessage([completion]),
        );
        this.store.setMessages(this.taskId, this.chat.messages);
        this.store.completeTask(this.taskId);
      },
    );
    mockState.instances.push(this);
  }

  markAsFailed(error: Error) {
    this.store.failTask(this.taskId, error.message);
  }

  persistToolOutput() {
    this.store.setMessages(this.taskId, this.chat.messages);
  }
  subscribeBackgroundJobs() {
    return () => {};
  }
  flushBackgroundJobNotifications() {
    return false;
  }
  markStartToolsExecution() {}

  markEndToolsExecution() {
    this.store.setMessages(this.taskId, this.chat.messages);
  }
}

type TestTask = {
  id: string;
  status: string;
  cwd?: string | null;
  error?: unknown;
  background: boolean;
};

describe("TaskExecutor", () => {

  it.each(["executor", "persisted cancellation"])(
    "settles a queued task's waiter after %s without waiting for an execution slot",
    async (source) => {
      const store = new FakeLiveKitStore(
        Array.from({ length: 11 }, (_, i) =>
          makeTask({ id: `task${i}`, status: "pending-model" }),
        ),
      );
      const ready = deferred<void>();
      const adaptor = {
        ...makeAdaptor({ executeToolCall: vi.fn() }),
        waitUntilReady: () => ready.promise,
      };
      const executor = makeExecutor(store, adaptor, {});
      const finished = vi.fn();
      try {
        void executor.waitForTaskDone("task10").then(finished);
        expect(executor.isTaskRunning("task10")).toBe(false);
        if (source === "executor") await executor.stopTask("task10");
        else store.failTask("task10", "Stopped by user.", "AbortError");
        await Promise.resolve();
        expect(finished).toHaveBeenCalledOnce();
      } finally {
        const disposing = executor.dispose();
        ready.resolve();
        await disposing;
      }
    },
  );

  it("unsubscribes from background jobs before reporting that a task has settled", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-model" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([
        makeToolPart("attemptCompletion", "done", { result: "Done" }),
      ]),
    ]);
    const calls: string[] = [];
    const waitForBackgroundJobs = vi.fn(async () => {});
    const executor = new TaskExecutor({
      store: store as never,
      blobStore: {} as never,
      readTaskState: () => ({}),
      adaptor: makeAdaptor({ executeToolCall: vi.fn() }),
      waitForBackgroundJobs,
      createChatKit: () => {
        store.completeTask("task");
        const chatKit = new MockLiveChatKit({ taskId: "task", store });
        chatKit.subscribeBackgroundJobs = () => () => {
          calls.push("unsubscribe");
        };
        return chatKit;
      },
      onTaskSettled: (taskId) => {
        expect(executor.isTaskRunning(taskId)).toBe(false);
        calls.push("settled");
      },
    });
    try {
      await executor.waitForTaskDone("task");
      expect(waitForBackgroundJobs).toHaveBeenCalledOnce();
      expect(calls).toEqual(["unsubscribe", "settled"]);
    } finally {
      await executor.dispose();
    }
  });

  it("does not subscribe or start a chat that finishes initializing after cancellation", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-model" }),
    ]);
    store.setMessages("task", [
      { id: "prompt", role: "user", parts: [{ type: "text", text: "Work" }] },
    ]);
    const ready = deferred<void>();
    const subscribe = vi.fn(() => () => {});
    const waitForBackgroundJobs = vi.fn(async () => {});
    const createChatKit = vi.fn(async () => {
      await ready.promise;
      const chatKit = new MockLiveChatKit({ taskId: "task", store });
      chatKit.subscribeBackgroundJobs = subscribe;
      return chatKit;
    });
    const executor = new TaskExecutor({
      store: store as never,
      blobStore: {} as never,
      readTaskState: () => ({}),
      adaptor: makeAdaptor({ executeToolCall: vi.fn() }),
      createChatKit,
      waitForBackgroundJobs,
    });
    try {
      executor.start();
      await waitFor(() => createChatKit.mock.calls.length === 1);
      const stopping = executor.stopTask("task");
      ready.resolve();
      await stopping;
      await executor.drain();
      expect(subscribe).not.toHaveBeenCalled();
      expect(waitForBackgroundJobs).not.toHaveBeenCalled();
      expect(mockState.instances[0]?.chat.sendMessageCalls).toBe(0);
      expect(store.readTask("task")?.error).toMatchObject({
        kind: "AbortError",
      });
    } finally {
      ready.resolve();
      await executor.dispose();
    }
  });

  it.each(["task-memory", "auto-memory", "auto-memory-dream"] as const)(
    "disables background command execution for a %s fork",
    async (useCase) => {
      const store = new FakeLiveKitStore([
        makeTask({ id: "fork", status: "pending-tool" }),
      ]);
      store.setMessages("fork", [
        makeAssistantMessage([
          makeToolPart("executeCommand", "command", { command: "echo test" }),
        ]),
      ]);
      const executeToolCall = vi.fn(async () => ({ output: "test" }));
      const executor = makeExecutor(store, makeAdaptor({ executeToolCall }), {
        useCase,
        tools: ["executeCommand"],
      });
      try {
        await executor.drain();
        expect(executeToolCall).toHaveBeenCalledWith(
          expect.objectContaining({ taskId: "fork", allowBackground: false }),
        );
      } finally {
        await executor.dispose();
      }
    },
  );

  afterEach(() => vi.restoreAllMocks());

  it.each(["streaming", "done"] as const)(
    "checks retained text state %s when retrying a failed response",
    async (state) => {
      const task = makeTask({ id: "task", status: "pending-model" });
      task.error = {
        kind: "InternalError",
        message: "The response stream was interrupted",
      };
      const store = new FakeLiveKitStore([task]);
      const tool = {
        ...makeToolPart("readFile", "read", { path: "a.ts" }),
        state: "output-available",
        output: { content: "hello" },
      } as Message["parts"][number];
      const message = makeAssistantMessage([
        { type: "step-start" },
        tool,
        { type: "step-start" },
        { type: "text", text: "Partial response", state },
      ]);
      store.setMessages("task", [message]);
      const adaptor = {
        ...makeAdaptor({ executeToolCall: vi.fn() }),
        // Fail after the executor starts, as an active request would.
        waitUntilReady: async () => {
          task.status = "failed";
        },
      };
      vi.spyOn(MockChat.prototype, "sendMessage").mockImplementation(
        async function (this: MockChat) {
          this.sendMessageCalls += 1;
          store.setMessages("task", this.messages);
          store.completeTask("task");
        },
      );
      const executor = makeExecutor(store, adaptor, { tools: ["readFile"] });
      await executor.drain();
      const messages = store.readMessages("task");
      expect(messages[0]).toEqual(message);
      if (state === "streaming") {
        expect(messages.at(-1)).toMatchObject({
          role: "user",
          parts: [
            {
              type: "text",
              text: prompts.createSystemReminder(
                prompts.incompleteResponseReminder,
              ),
            },
          ],
        });
      } else {
        expect(messages.at(-1)).toMatchObject({
          role: "user",
          parts: [
            {
              type: "text",
              text: prompts.createSystemReminder(prompts.toolCallsReminder),
            },
          ],
        });
      }
      expect(adaptor.executeToolCall).not.toHaveBeenCalled();
      await executor.dispose();
    },
  );

  it.each([false, true])(
    "checks unfinished reasoning in a prepared tool retry (strips partial step: %s)",
    async (stripPartialStep) => {
      const store = new FakeLiveKitStore([
        makeTask({ id: "task", status: "pending-model" }),
      ]);
      const retainedParts = [
        { type: "step-start" },
        { type: "reasoning", text: "Partial reasoning", state: "streaming" },
        {
          ...makeToolPart("readFile", "read", { path: "a.ts" }),
          state: "output-available",
          output: { content: "hello" },
        },
      ] as Message["parts"];
      const message = makeAssistantMessage([
        ...retainedParts,
        ...(stripPartialStep
          ? [
              { type: "step-start" } as const,
              makeToolPart("executeCommand", "exec", null, "input-streaming"),
            ]
          : []),
      ]);
      store.setMessages("task", [message]);
      const adaptor = makeAdaptor({ executeToolCall: vi.fn() });
      vi.spyOn(MockChat.prototype, "sendMessage").mockImplementation(
        async function (this: MockChat) {
          this.sendMessageCalls += 1;
          store.setMessages("task", this.messages);
          store.completeTask("task");
        },
      );
      const executor = makeExecutor(store, adaptor, { tools: ["readFile"] });

      await executor.drain();

      const messages = store.readMessages("task");
      expect(messages[0]).toEqual({ ...message, parts: retainedParts });
      expect(messages.at(-1)).toMatchObject({
        role: "user",
        parts: [
          {
            type: "text",
            text: prompts.createSystemReminder(
              prompts.incompleteResponseReminder,
            ),
          },
        ],
      });
      expect(adaptor.executeToolCall).not.toHaveBeenCalled();
      await executor.dispose();
    },
  );

  beforeEach(() => {
    mockState.instances.length = 0;
  });

  it("executes pending tool calls and sends the next model request", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-tool" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([
        makeToolPart("readFile", "read", { path: "a.ts" }),
      ]),
    ]);

    const adaptor = makeAdaptor({
      executeToolCall: vi.fn(async () => ({ content: "hello" })),
    });
    const executor = makeExecutor(store, adaptor, { tools: ["readFile"] });

    await executor.drain();

    expect(adaptor.executeToolCall).toHaveBeenCalledTimes(1);
    expect(mockState.instances[0].chat.sendMessageCalls).toBe(1);
    expect(store.readTask("task")?.status).toBe("completed");
    await executor.dispose();
  });

  it("resumes saved unfinished tasks on startup without rerunning saved tool results or cancelled tasks", async () => {
    // These are the persisted records left when a Webview disappears without
    // issuing an explicit cancellation. The new executor has no old chat state.
    const store = new FakeLiveKitStore([
      makeTask({ id: "model", status: "pending-model" }),
      makeTask({ id: "tools", status: "pending-tool" }),
      makeTask({ id: "done", status: "completed" }),
      {
        ...makeTask({ id: "stopped", status: "failed" }),
        error: { kind: "AbortError", message: "Stopped by user." },
      },
    ]);
    const prompt: Message = {
      id: "user",
      role: "user",
      parts: [{ type: "text", text: "Continue the saved task." }],
    };
    store.setMessages("model", [prompt]);
    const savedResult: Message["parts"][number] = {
      type: "tool-readFile",
      toolCallId: "saved",
      state: "output-available",
      input: { path: "a.ts" },
      output: {
        content: "already read",
        isTruncated: false,
        filePath: "/repo/a.ts",
      },
    };
    store.setMessages("tools", [
      makeAssistantMessage([
        savedResult,
        makeToolPart("readFile", "pending", { path: "b.ts" }),
      ]),
    ]);
    const executeToolCall = vi.fn(async () => ({ content: "resumed" }));
    const executor = makeExecutor(store, makeAdaptor({ executeToolCall }), {});

    try {
      executor.start();
      await Promise.all([
        executor.waitForTaskDone("model"),
        executor.waitForTaskDone("tools"),
      ]);
      expect(
        mockState.instances.map((instance) => instance.taskId).sort(),
      ).toEqual(["model", "tools"]);
      expect(executeToolCall).toHaveBeenCalledOnce();
      expect(executeToolCall).toHaveBeenCalledWith(
        expect.objectContaining({
          taskId: "tools",
          toolCallId: "pending",
          input: { path: "b.ts" },
        }),
      );
      expect(store.readMessages("model")[0]).toEqual(prompt);
      expect(getToolPart(store.readMessages("tools")[0], "saved")).toEqual(
        savedResult,
      );
      expect(store.readTask("model")?.status).toBe("completed");
      expect(store.readTask("tools")?.status).toBe("completed");
      expect(store.readTask("stopped")?.status).toBe("failed");
    } finally {
      await executor.dispose();
    }
  });

  it.each([1, 3])(
    "retries %s text-only subagent responses after they become pending-input",
    async (textResponses) => {
      const store = new FakeLiveKitStore([
        makeTask({ id: "task", status: "pending-model" }),
      ]);
      store.setMessages("task", [
        {
          id: "user",
          role: "user",
          parts: [{ type: "text", text: "Find the answer." }],
        },
      ]);
      const send = vi
        .spyOn(MockChat.prototype, "sendMessage")
        .mockImplementation(async function (this: MockChat) {
          if (send.mock.calls.length > 1) {
            expect(this.messages.at(-1)).toMatchObject({
              role: "user",
              parts: [
                {
                  type: "text",
                  text: prompts.createSystemReminder(prompts.toolCallsReminder),
                },
              ],
            });
          }
          respondToRequest(
            store,
            this,
            send.mock.calls.length <= textResponses
              ? [{ type: "text", text: "Here are the findings." }]
              : [
                  makeToolPart("attemptCompletion", "done", {
                    result: "Found it.",
                  }),
                ],
          );
        });
      const adaptor = makeAdaptor({ executeToolCall: vi.fn() });
      const executor = makeExecutor(store, adaptor, { parentTaskId: "parent" });
      try {
        await executor.drain();
        expect(send).toHaveBeenCalledTimes(textResponses + 1);
        expect(adaptor.executeToolCall).not.toHaveBeenCalled();
        expect(store.readTask("task")?.status).toBe("completed");
      } finally {
        await executor.dispose();
      }
    },
  );

  it("fails at the retry limit when a subagent keeps replying without tools", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-model" }),
    ]);
    store.setMessages("task", [
      {
        id: "user",
        role: "user",
        parts: [{ type: "text", text: "Find the answer." }],
      },
    ]);
    const send = vi
      .spyOn(MockChat.prototype, "sendMessage")
      .mockImplementation(async function (this: MockChat) {
        respondToRequest(store, this, [
          { type: "text", text: "Still thinking." },
        ]);
      });
    const executor = makeExecutor(
      store,
      makeAdaptor({ executeToolCall: vi.fn() }),
      {},
    );
    try {
      await executor.drain();
      expect(send).toHaveBeenCalledTimes(8);
      expect(store.readTask("task")).toMatchObject({
        status: "failed",
        error: {
          message: "The task failed to complete, max retry count reached.",
        },
      });
    } finally {
      await executor.dispose();
    }
  });

  it.each(["completed", "pending-input"])(
    "processes a new user message despite a stale %s status, like the CLI",
    async (status) => {
      const store = new FakeLiveKitStore([
        makeTask({ id: "task", status: "pending-model" }),
      ]);
      store.setMessages("task", [
        {
          id: "user",
          role: "user",
          parts: [{ type: "text", text: "Continue with this request." }],
        },
      ]);
      const ready = deferred<void>();
      const adaptor = {
        ...makeAdaptor({ executeToolCall: vi.fn() }),
        waitUntilReady: () => ready.promise,
      };
      const executor = makeExecutor(store, adaptor, {});
      try {
        executor.start();
        store.updateTaskStatus("task", status);
        ready.resolve();
        await executor.drain();
        expect(mockState.instances[0].chat.sendMessageCalls).toBe(1);
        expect(store.readTask("task")?.status).toBe("completed");
      } finally {
        ready.resolve();
        await executor.dispose();
      }
    },
  );

  it.each(["task-memory", "auto-memory", "auto-memory-dream"] as const)(
    "reminds a %s task until it calls attemptCompletion, like the CLI",
    async (useCase) => {
      const store = new FakeLiveKitStore([
        makeTask({ id: "task", status: "pending-model" }),
      ]);
      store.setMessages("task", [
        {
          id: "user",
          role: "user",
          parts: [{ type: "text", text: "Update memory." }],
        },
      ]);
      const send = vi
        .spyOn(MockChat.prototype, "sendMessage")
        .mockImplementation(async function (this: MockChat) {
          if (send.mock.calls.length === 2) {
            expect(this.messages.at(-1)).toMatchObject({
              role: "user",
              parts: [
                {
                  type: "text",
                  text: prompts.createSystemReminder(prompts.toolCallsReminder),
                },
              ],
            });
          }
          respondToRequest(
            store,
            this,
            send.mock.calls.length === 1
              ? [{ type: "text", text: "No memory changes needed." }]
              : [
                  makeToolPart("attemptCompletion", "done", {
                    result: "No memory changes needed.",
                  }),
                ],
          );
        });
      const executor = makeExecutor(
        store,
        makeAdaptor({ executeToolCall: vi.fn() }),
        { useCase },
      );
      try {
        await executor.drain();
        expect(send).toHaveBeenCalledTimes(2);
        expect(store.readTask("task")?.status).toBe("completed");
      } finally {
        await executor.dispose();
      }
    },
  );

  it("persists cancellation while an active subagent has pending-input status", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-model" }),
    ]);
    store.setMessages("task", [
      {
        id: "user",
        role: "user",
        parts: [{ type: "text", text: "Find the answer." }],
      },
    ]);
    const finished = deferred<void>();
    const send = vi
      .spyOn(MockChat.prototype, "sendMessage")
      .mockImplementation(async function (this: MockChat) {
        respondToRequest(store, this, [
          { type: "text", text: "Here are the findings." },
        ]);
        await finished.promise;
      });
    vi.spyOn(MockChat.prototype, "stop").mockImplementation(async () => {
      finished.resolve();
    });
    const executor = makeExecutor(
      store,
      makeAdaptor({ executeToolCall: vi.fn() }),
      {},
    );
    try {
      executor.start();
      await waitFor(() => store.readTask("task")?.status === "pending-input");
      await executor.stopTask("task");
      expect(send).toHaveBeenCalledOnce();
      expect(store.readTask("task")).toMatchObject({
        status: "failed",
        error: { kind: "AbortError" },
      });
    } finally {
      finished.resolve();
      await executor.dispose();
    }
  });

  it.each([true, false])(
    "passes omitAgentsMd=%s to environment resolution",
    async (omitAgentsMd) => {
      const store = new FakeLiveKitStore([
        makeTask({ id: "task", status: "pending-tool" }),
      ]);
      store.setMessages("task", [
        makeAssistantMessage([
          makeToolPart("readFile", "read", { path: "a.ts" }),
        ]),
      ]);
      const base = makeAdaptor({ executeToolCall: vi.fn(async () => ({})) });
      const getRequestGetters = vi.fn(() => ({
        ...base.getRequestGetters(),
        getCustomAgents: () => [{ name: "reader", omitAgentsMd }] as never,
      }));
      const executor = makeExecutor(
        store,
        { ...base, getRequestGetters },
        { agentType: "reader" },
      );
      await executor.drain();
      expect(getRequestGetters).toHaveBeenLastCalledWith({
        taskId: "task",
        cwd: "/repo",
        omitCustomRules: omitAgentsMd,
      });
      await executor.dispose();
    },
  );

  it("uses the background task's configured max steps", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-tool" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([
        { type: "step-start" },
        { type: "step-start" },
        makeToolPart("readFile", "read", { path: "a.ts" }),
      ]),
    ]);
    const executeToolCall = vi.fn();
    const adaptor = makeAdaptor({ executeToolCall });
    const executor = makeExecutor(store, adaptor, {
      tools: ["readFile"],
      maxSteps: 1,
    });

    await executor.drain();

    expect(executeToolCall).not.toHaveBeenCalled();
    expect(mockState.instances[0].chat.sendMessageCalls).toBe(0);
    expect(store.readTask("task")).toMatchObject({
      status: "failed",
      error: {
        kind: "InternalError",
        message:
          "The task failed to complete, max step count reached (used 2 of 1 steps).",
      },
    });
    await executor.dispose();
  });

  it("does not request another model step after processing the configured last step", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-tool" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([
        { type: "step-start" },
        makeToolPart("readFile", "read", { path: "a.ts" }),
      ]),
    ]);
    const executeToolCall = vi.fn(async () => ({ content: "hello" }));
    const adaptor = makeAdaptor({ executeToolCall });
    const executor = makeExecutor(store, adaptor, {
      tools: ["readFile"],
      maxSteps: 1,
    });

    await executor.drain();

    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(mockState.instances[0].chat.sendMessageCalls).toBe(0);
    expect(
      getToolPart(store.readMessages("task").at(-1), "read"),
    ).toMatchObject({
      state: "output-available",
      output: { content: "hello" },
    });
    expect(store.readTask("task")).toMatchObject({
      status: "failed",
      error: {
        kind: "InternalError",
        message:
          "The task failed to complete, max step count reached (used 1 of 1 steps).",
      },
    });
    await executor.dispose();
  });

  it("warns a step-bounded task as its step budget runs out", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-tool" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([
        { type: "step-start" },
        makeToolPart("readFile", "read-1", { path: "a.ts" }),
      ]),
    ]);
    const reminders: string[] = [];
    const send = vi
      .spyOn(MockChat.prototype, "sendMessage")
      .mockImplementation(async function (this: MockChat) {
        const last = this.messages.at(-1);
        const part = last?.role === "user" ? last.parts[0] : undefined;
        if (part?.type === "text") reminders.push(part.text);
        respondToRequest(store, this, [
          { type: "step-start" },
          send.mock.calls.length === 1
            ? makeToolPart("readFile", "read-2", { path: "b.ts" })
            : makeToolPart("attemptCompletion", "done", { result: "ok" }),
        ]);
      });
    const adaptor = makeAdaptor({
      executeToolCall: vi.fn(async () => ({ content: "hello" })),
    });
    const executor = makeExecutor(store, adaptor, {
      tools: ["readFile", "attemptCompletion"],
      maxSteps: 3,
    });

    try {
      await executor.drain();

      expect(reminders).toEqual([
        prompts.createSystemReminder(
          prompts.stepBudgetReminder({ remainingSteps: 2, maxSteps: 3 }),
        ),
        prompts.createSystemReminder(
          prompts.stepBudgetReminder({ remainingSteps: 1, maxSteps: 3 }),
        ),
      ]);
      expect(store.readTask("task")?.status).toBe("completed");
    } finally {
      await executor.dispose();
    }
  });

  it("does not warn tasks that run on the default step budget", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-tool" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([
        { type: "step-start" },
        makeToolPart("readFile", "read-1", { path: "a.ts" }),
      ]),
    ]);
    const send = vi
      .spyOn(MockChat.prototype, "sendMessage")
      .mockImplementation(async function (this: MockChat) {
        expect(this.messages.at(-1)?.role).toBe("assistant");
        respondToRequest(store, this, [
          { type: "step-start" },
          makeToolPart("attemptCompletion", "done", { result: "ok" }),
        ]);
      });
    const adaptor = makeAdaptor({
      executeToolCall: vi.fn(async () => ({ content: "hello" })),
    });
    const executor = makeExecutor(store, adaptor, { tools: ["readFile"] });

    try {
      await executor.drain();
      expect(send).toHaveBeenCalledTimes(1);
    } finally {
      await executor.dispose();
    }
  });

  it("still enforces the step limit when tools change the status without a result message", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-tool" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([
        { type: "step-start" },
        makeToolPart("readFile", "read", { path: "a.ts" }),
      ]),
    ]);
    const executeToolCall = vi.fn(async () => {
      store.completeTask("task");
      return { content: "hello" };
    });
    const adaptor = makeAdaptor({ executeToolCall });
    const executor = makeExecutor(store, adaptor, {
      tools: ["readFile"],
      maxSteps: 1,
    });

    await executor.drain();

    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(store.readTask("task")).toMatchObject({
      status: "failed",
      error: {
        message:
          "The task failed to complete, max step count reached (used 1 of 1 steps).",
      },
    });
    expect(mockState.instances[0].chat.sendMessageCalls).toBe(0);
    expect(
      getToolPart(store.readMessages("task").at(-1), "read"),
    ).toMatchObject({
      state: "output-available",
      output: { content: "hello" },
    });
    await executor.dispose();
  });

  it("does not overwrite a completed response when observing the step limit", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-model" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([
        { type: "step-start" },
        { type: "step-start" },
        makeToolPart("attemptCompletion", "complete", { result: "done" }),
      ]),
    ]);
    const ready = deferred<void>();
    const adaptor: RunningTaskAdaptor = {
      ...makeAdaptor({ executeToolCall: vi.fn() }),
      waitUntilReady: () => ready.promise,
    };
    const executor = makeExecutor(store, adaptor, { maxSteps: 1 });

    executor.start();
    store.completeTask("task");
    ready.resolve();
    await executor.drain();

    expect(mockState.instances[0].chat.sendMessageCalls).toBe(0);
    expect(store.readTask("task")?.status).toBe("completed");
    await executor.dispose();
  });

  it("does not start duplicate running tasks for the same active task", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-tool" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([
        makeToolPart("readFile", "read", { path: "a.ts" }),
      ]),
    ]);
    const pending = deferred<unknown>();
    const executeToolCall = vi.fn(() => pending.promise);
    const adaptor = makeAdaptor({
      executeToolCall,
    });
    const executor = makeExecutor(store, adaptor, { tools: ["readFile"] });

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

  it("runs two background subagents concurrently", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "first", status: "pending-tool" }),
      makeTask({ id: "second", status: "pending-tool" }),
    ]);
    for (const id of ["first", "second"]) {
      store.setMessages(id, [
        makeAssistantMessage([makeToolPart("readFile", id, { path: "a.ts" })]),
      ]);
    }
    const pending = deferred<unknown>();
    const executeToolCall = vi.fn(() => pending.promise);
    const executor = makeExecutor(store, makeAdaptor({ executeToolCall }), {});
    executor.start();
    await waitFor(() => executeToolCall.mock.calls.length === 2);
    expect(store.readTask("first")?.status).toBe("pending-tool");
    expect(store.readTask("second")?.status).toBe("pending-tool");
    pending.resolve({ content: "done" });
    await executor.drain();
    expect(store.readTask("first")?.status).toBe("completed");
    expect(store.readTask("second")?.status).toBe("completed");
    await executor.dispose();
  });

  it.each(["executor", "persisted cancellation"])(
    "stops a subagent via %s without restarting it or stopping its sibling",
    async (source) => {
      const store = new FakeLiveKitStore([
        makeTask({ id: "first", status: "pending-tool" }),
        makeTask({ id: "second", status: "pending-tool" }),
      ]);
      for (const id of ["first", "second"]) {
        store.setMessages(id, [
          makeAssistantMessage([
            makeToolPart("readFile", id, { path: "a.ts" }),
          ]),
        ]);
      }
      const pending = deferred<unknown>();
      const executeToolCall = vi.fn(
        ({
          abortSignal,
        }: Parameters<RunningTaskAdaptor["executeToolCall"]>[0]) =>
          Promise.race([
            pending.promise,
            new Promise((_, reject) => {
              abortSignal.addEventListener(
                "abort",
                () => reject(abortSignal.reason),
                { once: true },
              );
            }),
          ]),
      );
      const executor = makeExecutor(
        store,
        makeAdaptor({ executeToolCall }),
        {},
      );
      executor.start();
      await waitFor(() => executeToolCall.mock.calls.length === 2);
      if (source === "executor") {
        await executor.stopTask("first");
      } else {
        store.commit({
          name: "v1.TaskFailed",
          args: {
            id: "first",
            error: { kind: "AbortError", message: "Stopped by user." },
          },
        });
        await waitFor(
          () => executeToolCall.mock.calls[0][0].abortSignal.aborted,
        );
      }
      expect(store.readTask("first")?.status).toBe("failed");
      expect(store.readTask("second")?.status).toBe("pending-tool");
      expect(
        mockState.instances.filter((x) => x.taskId === "first"),
      ).toHaveLength(1);
      pending.resolve({ content: "done" });
      await executor.drain();
      expect(store.readTask("second")?.status).toBe("completed");
      await executor.dispose();
    },
  );

  it("fails a missing custom agent once instead of rescheduling initialization", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-model" }),
    ]);
    const executeToolCall = vi.fn();
    const executor = makeExecutor(store, makeAdaptor({ executeToolCall }), {
      agentType: "missing",
    });
    await executor.drain();
    expect(store.readTask("task")).toMatchObject({
      status: "failed",
      error: {
        message:
          'Custom agent "missing" not found for background subagent task.',
      },
    });
    expect(executeToolCall).not.toHaveBeenCalled();
    await executor.dispose();
  });

  it("uses a custom subagent's tool restrictions", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-tool" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([
        makeToolPart("executeCommand", "exec", { command: "echo hi" }),
      ]),
    ]);
    const adaptor = makeAdaptor({ executeToolCall: vi.fn() });
    const executor = makeExecutor(
      store,
      {
        ...adaptor,
        getRequestGetters: () => ({
          ...adaptor.getRequestGetters(),
          getCustomAgents: () =>
            [{ name: "reader", tools: ["readFile"] }] as never,
        }),
      },
      { agentType: "reader" },
    );
    await executor.drain();
    expect(adaptor.executeToolCall).not.toHaveBeenCalled();
    expect(
      getToolPart(store.readMessages("task").at(-1), "exec")?.output,
    ).toEqual({
      error: "Tool executeCommand is not allowed for this task.",
    });
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
      executeToolCall: vi.fn(async () => ({ ok: true })),
    });
    const executor = makeExecutor(store, adaptor, { tools: ["readFile"] });

    await executor.drain();

    expect(adaptor.executeToolCall).not.toHaveBeenCalled();
    expect(
      getToolPart(store.readMessages("task").at(-1), "exec"),
    ).toMatchObject({
      state: "output-available",
      output: {
        error: "Tool executeCommand is not allowed for this task.",
      },
    });
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
      executeToolCall: vi.fn(async () => ({ ok: true })),
    });
    const executor = makeExecutor(store, adaptor, {
      tools: ["writeToFile(/repo/allowed.md)"],
    });

    await executor.drain();

    expect(adaptor.executeToolCall).not.toHaveBeenCalled();
    expect(
      String(
        (
          getToolPart(store.readMessages("task").at(-1), "write")?.output as {
            error?: string;
          }
        )?.error,
      ),
    ).toContain("not allowed");
    await executor.dispose();
  });

  it("keeps background file-state cache when retry keeps completed readFile", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-model" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([
        { type: "step-start" },
        {
          type: "tool-readFile",
          toolCallId: "read",
          state: "output-available",
          input: { path: "a.ts" },
          output: {
            content: "hello",
            isTruncated: false,
            filePath: "/repo/a.ts",
          },
        },
        { type: "step-start" },
        makeToolPart("executeCommand", "exec", null, "input-streaming"),
      ]),
    ]);
    const adaptor = makeAdaptor({
      executeToolCall: vi.fn(async () => ({ ok: true })),
    });
    const clearFileStateCache = vi.fn();
    const executor = makeExecutor(store, adaptor, {}, clearFileStateCache);

    await executor.drain();

    expect(clearFileStateCache).not.toHaveBeenCalled();
    await executor.dispose();
  });

  it("clears background file-state cache when retry strips completed readFile", async () => {
    const store = new FakeLiveKitStore([
      makeTask({ id: "task", status: "pending-model" }),
    ]);
    store.setMessages("task", [
      makeAssistantMessage([
        { type: "step-start" },
        {
          type: "tool-readFile",
          toolCallId: "read-kept",
          state: "output-available",
          input: { path: "a.ts" },
          output: {
            content: "hello",
            isTruncated: false,
            filePath: "/repo/a.ts",
          },
        },
        { type: "step-start" },
        {
          type: "tool-readFile",
          toolCallId: "read-stripped",
          state: "output-available",
          input: { path: "b.ts" },
          output: {
            content: "world",
            isTruncated: false,
            filePath: "/repo/b.ts",
          },
        },
        makeToolPart("executeCommand", "exec", null, "input-streaming"),
      ]),
    ]);
    const adaptor = makeAdaptor({
      executeToolCall: vi.fn(async () => ({ ok: true })),
    });
    const clearFileStateCache = vi.fn();
    const executor = makeExecutor(store, adaptor, {}, clearFileStateCache);

    await executor.drain();

    expect(clearFileStateCache).toHaveBeenCalledWith("task");
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
    if (query.label === "backgroundTasks") return [];
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

  commit(event: {
    name: string;
    args: { id: string; error: { kind?: string; message: string } };
  }) {
    this.failTask(
      event.args.id,
      event.args.error.message,
      event.args.error.kind,
    );
  }

  readRunnableTasks() {
    return [...this.tasks.values()].filter(
      (task) =>
        task.background &&
        ["pending-model", "pending-tool"].includes(task.status),
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
    this.updateTaskStatus(taskId, "completed");
  }

  updateTaskStatus(taskId: string, status: string) {
    const task = this.readTask(taskId);
    if (!task) return;
    this.tasks.set(taskId, { ...task, status });
    this.emit();
  }

  failTask(taskId: string, message: string, kind = "InternalError") {
    const task = this.readTask(taskId);
    if (!task) return;
    this.tasks.set(taskId, {
      ...task,
      status: "failed",
      error: { kind, message },
    });
    this.emit();
  }

  emit() {
    for (const subscriber of this.subscribers) {
      subscriber();
    }
  }
}

function makeAdaptor({
  executeToolCall,
}: {
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
    executeToolCall,
  } satisfies RunningTaskAdaptor;
}

function makeExecutor(
  store: FakeLiveKitStore,
  adaptor: RunningTaskAdaptor,
  taskState: BackgroundTaskState,
  clearFileStateCache?: (taskId: string) => MaybePromise<void>,
) {
  return new TaskExecutor({
    store: store as never,
    blobStore: {} as never,
    readTaskState: () => taskState,
    adaptor,
    clearFileStateCache,
    createChatKit: ({ taskId, store }) =>
      new MockLiveChatKit({
        taskId,
        store: store as never,
      }),
  });
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

function respondToRequest(
  store: FakeLiveKitStore,
  chat: MockChat,
  parts: Message["parts"],
) {
  const message = {
    ...makeAssistantMessage(parts),
    metadata: { kind: "assistant", finishReason: "stop" },
  } as Message;
  chat.appendOrReplaceMessage(message);
  store.setMessages("task", chat.messages);
  // Use LiveChatKit's normal status conversion, including pending-input for text.
  store.updateTaskStatus("task", toTaskStatus(message, "stop"));
}

function makeToolPart(
  toolName: string,
  toolCallId: string,
  input: unknown,
  state = "input-available",
) {
  return {
    type: `tool-${toolName}`,
    toolCallId,
    state,
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
