import { prompts } from "@getpochi/common";
import { getToolCallCancelErrorMessage } from "@getpochi/tools";
import type { AbstractChat } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { Message } from "../../../types";
import { type RunningTaskAdaptor, TaskExecutor } from "../task-executor";

/**
 * Messages sent to a running background task: queued for the next step,
 * steering an in-flight response, waking an idle task, and handing back to
 * the caller once the task's loop has ended.
 */
describe("TaskExecutor.sendMessage", () => {
  it("steers an in-flight response and the restart is not mistaken for a cancellation", async () => {
    const store = new FakeStore([task("task", "pending-model")]);
    store.setMessages("task", [userMessage("u1", "Refactor module A.")]);
    let requests = 0;
    const kits: SteerChatKit[] = [];
    const executor = makeExecutor(store, kits, {
      respond: async (chat, signal) => {
        requests += 1;
        if (requests === 1) {
          chat.appendOrReplaceMessage(assistantText("a1", "Starting on A"));
          await signal; // until the steer stops it
          return;
        }
        complete(store, chat, "Did B instead.");
      },
      beforeStart: () => {
        // Another task changes while this one is still in the failed state
        // that the stop left behind (e.g. while compaction or environment
        // loading runs before the request starts).
        if (requests === 1) store.emit();
      },
    });

    executor.start();
    await waitFor(() => kits[0]?.chat.status === "streaming");
    await expect(
      executor.sendMessage("task", "Do B instead.", { interrupt: true }),
    ).resolves.toBe("interrupted");
    await executor.drain();

    expect(requests).toBe(2);
    expect(store.readTask("task")?.status).toBe("completed");
    const messages = store.readMessages("task");
    expect(messages.map((m) => m.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(textOf(messages[2])).toContain("Do B instead.");
    expect(textOf(messages[2])).toContain(
      prompts.createSystemReminder(prompts.userInputAfterInterruption),
    );
    await executor.dispose();
  });

  it("does not spend the retry budget on steering", async () => {
    const store = new FakeStore([task("task", "pending-model")]);
    store.setMessages("task", [userMessage("u1", "Write the report.")]);
    const kits: SteerChatKit[] = [];
    let requests = 0;
    const executor = makeExecutor(store, kits, {
      respond: async (chat, signal) => {
        requests += 1;
        if (requests <= 10) {
          chat.appendOrReplaceMessage(
            assistantText(`a${requests}`, `Draft ${requests}`),
          );
          await signal;
          return;
        }
        complete(store, chat, "Final report.");
      },
    });

    executor.start();
    for (let i = 1; i <= 10; i++) {
      await waitFor(
        () => requests === i && kits[0]?.chat.status === "streaming",
      );
      await expect(
        executor.sendMessage("task", `Change ${i}`, { interrupt: true }),
      ).resolves.toBe("interrupted");
    }
    await executor.drain();

    expect(store.readTask("task")?.status).toBe("completed");
    expect(requests).toBe(11);
    await executor.dispose();
  });

  it("still honors a real cancellation after a steer has restarted the task", async () => {
    const store = new FakeStore([task("task", "pending-model")]);
    store.setMessages("task", [userMessage("u1", "Refactor module A.")]);
    const kits: SteerChatKit[] = [];
    let requests = 0;
    const executor = makeExecutor(store, kits, {
      respond: async (chat, signal) => {
        requests += 1;
        chat.appendOrReplaceMessage(assistantText(`a${requests}`, "Working"));
        await signal;
      },
    });

    executor.start();
    await waitFor(() => kits[0]?.chat.status === "streaming");
    await executor.sendMessage("task", "Do B instead.", { interrupt: true });
    await waitFor(
      () => requests === 2 && store.readTask("task")?.status === "pending-model",
    );
    // The user stops the subagent from another view.
    store.failTask("task", "Stopped by user.", "AbortError");
    await waitFor(() => !executor.isTaskRunning("task"));

    // Stopped rather than restarted: no third request goes out.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(requests).toBe(2);
    expect(store.readTask("task")).toMatchObject({
      status: "failed",
      error: { kind: "AbortError" },
    });
    await executor.dispose();
  });

  it("lets a running tool call finish, skips the ones not started, and sends the message next", async () => {
    const store = new FakeStore([task("task", "pending-tool")]);
    store.setMessages("task", [
      userMessage("u1", "Update both files."),
      {
        id: "a1",
        role: "assistant",
        parts: [
          toolPart("writeToFile", "write-a", { path: "a.ts", content: "a" }),
          toolPart("writeToFile", "write-b", { path: "b.ts", content: "b" }),
        ],
      } as Message,
    ]);
    const releaseWrite = deferred<void>();
    const writeStarted = deferred<void>();
    const executeToolCall = vi.fn(async () => {
      writeStarted.resolve();
      await releaseWrite.promise;
      return { success: true };
    });
    const kits: SteerChatKit[] = [];
    let requestMessages: Message[] = [];
    const executor = makeExecutor(store, kits, {
      executeToolCall,
      respond: async (chat) => {
        requestMessages = structuredClone(chat.messages);
        complete(store, chat, "Only a.ts was updated.");
      },
    });

    executor.start();
    await writeStarted.promise;
    await expect(
      executor.sendMessage("task", "Leave b.ts alone.", { interrupt: true }),
    ).resolves.toBe("interrupted");
    releaseWrite.resolve();
    await executor.drain();

    expect(executeToolCall).toHaveBeenCalledOnce();
    const toolMessage = requestMessages[1];
    expect(toolOutput(toolMessage, "write-a")).toEqual({ success: true });
    expect(toolOutput(toolMessage, "write-b")).toEqual({
      error: getToolCallCancelErrorMessage("steered"),
    });
    // Its own turn, not a note folded into the step it cut short.
    expect(requestMessages.at(-1)).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "Leave b.ts alone." }],
    });
    expect(kits[0]?.flushes).toBe(1);
    expect(store.readTask("task")?.status).toBe("completed");
    await executor.dispose();
  });

  it("reports a queued message when the only tool call is already running, and still sends it as the next turn", async () => {
    const store = new FakeStore([task("task", "pending-tool")]);
    store.setMessages("task", [
      userMessage("u1", "Fix the failing test."),
      {
        id: "a1",
        role: "assistant",
        parts: [
          toolPart("writeToFile", "write-a", { path: "a.ts", content: "a" }),
        ],
      } as Message,
    ]);
    const releaseWrite = deferred<void>();
    const writeStarted = deferred<void>();
    const kits: SteerChatKit[] = [];
    let requestMessages: Message[] = [];
    const executor = makeExecutor(store, kits, {
      executeToolCall: vi.fn(async () => {
        writeStarted.resolve();
        await releaseWrite.promise;
        return { success: true };
      }),
      respond: async (chat) => {
        requestMessages = structuredClone(chat.messages);
        complete(store, chat, "Done.");
      },
    });

    executor.start();
    await writeStarted.promise;
    await expect(
      executor.sendMessage("task", "Use b.ts instead.", { interrupt: true }),
    ).resolves.toBe("queued");
    releaseWrite.resolve();
    await executor.drain();

    expect(toolOutput(requestMessages[1], "write-a")).toEqual({
      success: true,
    });
    expect(requestMessages.at(-1)).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "Use b.ts instead." }],
    });
    await executor.dispose();
  });

  it("wakes a task that waits for its background jobs and does not report an interrupt", async () => {
    const store = new FakeStore([task("task", "pending-model")]);
    store.setMessages("task", [userMessage("u1", "Run the tests.")]);
    const kits: SteerChatKit[] = [];
    let requests = 0;
    const waiting = deferred<void>();
    const executor = makeExecutor(store, kits, {
      respond: async (chat) => {
        requests += 1;
        complete(store, chat, requests === 1 ? "Started." : "Also linted.");
      },
      waitForBackgroundJobs: (_taskId, signal) => {
        if (requests > 1) return Promise.resolve();
        waiting.resolve();
        return new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
      },
    });

    executor.start();
    await waiting.promise;
    await expect(
      executor.sendMessage("task", "Also run the linter.", { interrupt: true }),
    ).resolves.toBe("queued");
    await executor.drain();

    expect(requests).toBe(2);
    expect(textOf(store.readMessages("task").at(-2))).toContain(
      "Also run the linter.",
    );
    await executor.dispose();
  });

  it("delivers a message sent before the task's chat is ready", async () => {
    const store = new FakeStore([task("task", "pending-model")]);
    store.setMessages("task", [userMessage("u1", "Summarize the docs.")]);
    const ready = deferred<void>();
    const kits: SteerChatKit[] = [];
    let requestMessages: Message[] = [];
    const executor = makeExecutor(store, kits, {
      waitUntilReady: () => ready.promise,
      respond: async (chat) => {
        requestMessages = structuredClone(chat.messages);
        complete(store, chat, "Summary.");
      },
    });

    executor.start();
    const sending = executor.sendMessage("task", "Keep it short.");
    ready.resolve();
    await expect(sending).resolves.toBe("queued");
    await executor.drain();

    expect(textOf(requestMessages.at(-1))).toContain("Keep it short.");
    await executor.dispose();
  });

  it("refuses a message once the task's loop has ended, even while it is still finalizing", async () => {
    const store = new FakeStore([task("task", "pending-model")]);
    store.setMessages("task", [userMessage("u1", "Check the build.")]);
    const finishing = deferred<void>();
    const finished = deferred<void>();
    const kits: SteerChatKit[] = [];
    const executor = makeExecutor(store, kits, {
      respond: async (chat) => complete(store, chat, "Build is green."),
      onTaskFinished: async () => {
        finishing.resolve();
        await finished.promise;
      },
    });

    executor.start();
    await finishing.promise;
    expect(executor.isTaskRunning("task")).toBe(true);
    await expect(
      executor.sendMessage("task", "Now check the docs."),
    ).resolves.toBeUndefined();
    expect(kits[0]?.queued).toEqual([]);
    finished.resolve();
    await executor.drain();
    await executor.dispose();
  });

  it("refuses a message for a task it is not running", async () => {
    const store = new FakeStore([task("task", "completed")]);
    const executor = makeExecutor(store, [], {
      respond: async () => {},
    });
    executor.start();
    await expect(
      executor.sendMessage("task", "Anything else?"),
    ).resolves.toBeUndefined();
    await executor.dispose();
  });
});

type TestTask = {
  id: string;
  status: string;
  cwd: string;
  background: boolean;
  error: unknown;
};

type Respond = (chat: SteerChat, aborted: Promise<void>) => Promise<void>;

/**
 * A chat kit with LiveChatKit's pending-input behavior: queued input rides
 * along with the next request, and flushPendingInput turns it into a new
 * turn. Stopping a request records the abort failure like LiveChatKit does.
 */
class SteerChatKit {
  readonly chat: SteerChat;
  queued: string[] = [];

  constructor(
    readonly taskId: string,
    readonly store: FakeStore,
    readonly respond: Respond,
    readonly beforeStart?: () => void,
  ) {
    this.chat = new SteerChat(store.readMessages(taskId), this);
  }

  queueUserInput(input: { parts: Array<{ type: "text"; text: string }> }) {
    this.queued.push(input.parts.map((part) => part.text).join(""));
    return crypto.randomUUID();
  }

  /** Attaches queued input to the request about to go out. */
  attachQueued() {
    if (this.queued.length === 0) return;
    const texts = this.queued.splice(0);
    this.chat.appendOrReplaceMessage(
      userMessage(crypto.randomUUID(), texts.join("\n")),
    );
  }

  flushes = 0;

  flushPendingInput() {
    if (this.queued.length === 0) return false;
    this.flushes += 1;
    const texts = this.queued.splice(0);
    // Like isInterruptedAssistantResponse: a response cut off mid-stream.
    const last = this.chat.messages.at(-1);
    const interrupted =
      last?.role === "assistant" &&
      last.parts.some(
        (part) => part.type === "text" && part.state === "streaming",
      );
    this.chat.appendOrReplaceMessage({
      id: crypto.randomUUID(),
      role: "user",
      parts: [
        ...(interrupted
          ? [
              {
                type: "text" as const,
                text: prompts.createSystemReminder(
                  prompts.userInputAfterInterruption,
                ),
              },
            ]
          : []),
        ...texts.map((text) => ({ type: "text" as const, text })),
      ],
    });
    return true;
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
  markStartToolsExecution() {}
  markEndToolsExecution() {
    this.store.setMessages(this.taskId, this.chat.messages);
  }
}

class SteerChat {
  messages: Message[];
  status: "ready" | "streaming" = "ready";
  private abort: (() => void) | undefined;

  constructor(
    messages: Message[],
    private readonly kit: SteerChatKit,
  ) {
    this.messages = structuredClone(messages);
  }

  appendOrReplaceMessage(message: Message) {
    const index = this.messages.findIndex((m) => m.id === message.id);
    if (index === -1) this.messages.push(structuredClone(message));
    else this.messages[index] = structuredClone(message);
  }

  async addToolOutput({
    toolCallId,
    output,
  }: Parameters<AbstractChat<Message>["addToolOutput"]>[0]) {
    const last = this.messages.at(-1);
    if (!last) return;
    this.messages = [
      ...this.messages.slice(0, -1),
      {
        ...last,
        parts: last.parts.map((part) =>
          "toolCallId" in part && part.toolCallId === toolCallId
            ? { ...part, state: "output-available", output }
            : part,
        ),
      } as Message,
    ];
  }

  async stop() {
    this.abort?.();
  }

  async sendMessage() {
    this.status = "streaming";
    this.kit.beforeStart?.();
    this.kit.attachQueued();
    this.kit.store.updateTaskStatus(this.kit.taskId, "pending-model");
    let aborted = false;
    const abortedPromise = new Promise<void>((resolve) => {
      this.abort = () => {
        aborted = true;
        resolve();
      };
    });
    await Promise.race([this.kit.respond(this, abortedPromise), abortedPromise]);
    this.abort = undefined;
    this.status = "ready";
    this.kit.store.setMessages(this.kit.taskId, this.messages);
    if (aborted) {
      this.kit.store.failTask(
        this.kit.taskId,
        "Transport is aborted",
        "AbortError",
      );
    }
  }
}

class FakeStore {
  readonly storeId = "test-store";
  private readonly tasks = new Map<string, TestTask>();
  private readonly messages = new Map<string, Message[]>();
  private readonly subscribers = new Set<() => void>();

  constructor(tasks: TestTask[]) {
    for (const t of tasks) this.tasks.set(t.id, t);
  }

  subscribe(_query: unknown, callback: () => void) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  query(query: unknown) {
    const { label, hash } = query as { label: string; hash: string };
    const taskId = hash?.slice(hash.lastIndexOf("-") + 1);
    if (label === "runnableTasks") {
      return [...this.tasks.values()].filter(
        (t) =>
          t.background && ["pending-model", "pending-tool"].includes(t.status),
      );
    }
    if (label === "task") return this.readTask(taskId);
    if (label === "messages") {
      return this.readMessages(taskId).map((data) => ({ data }));
    }
    return undefined;
  }

  commit(event: {
    args: { id: string; error: { kind?: string; message: string } };
  }) {
    this.failTask(event.args.id, event.args.error.message, event.args.error.kind);
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

  updateTaskStatus(taskId: string, status: string) {
    const current = this.readTask(taskId);
    if (!current) return;
    this.tasks.set(taskId, { ...current, status, error: null });
    this.emit();
  }

  failTask(taskId: string, message: string, kind = "InternalError") {
    const current = this.readTask(taskId);
    if (!current) return;
    this.tasks.set(taskId, {
      ...current,
      status: "failed",
      error: { kind, message },
    });
    this.emit();
  }

  emit() {
    for (const subscriber of [...this.subscribers]) subscriber();
  }
}

function makeExecutor(
  store: FakeStore,
  kits: SteerChatKit[],
  options: {
    respond: Respond;
    beforeStart?: () => void;
    executeToolCall?: RunningTaskAdaptor["executeToolCall"];
    waitUntilReady?: () => Promise<void>;
    waitForBackgroundJobs?: (
      taskId: string,
      signal: AbortSignal,
    ) => Promise<void>;
    onTaskFinished?: (taskId: string) => Promise<undefined>;
  },
) {
  return new TaskExecutor({
    store: store as never,
    blobStore: {} as never,
    readTaskState: () => ({ tools: ["writeToFile"] }),
    waitForBackgroundJobs: options.waitForBackgroundJobs,
    adaptor: {
      getRequestGetters: () => ({ getLLM: () => ({ id: "test" }) as never }),
      executeToolCall: options.executeToolCall ?? vi.fn(),
      waitUntilReady: options.waitUntilReady,
      onTaskFinished: options.onTaskFinished,
    },
    createChatKit: ({ taskId }) => {
      const kit = new SteerChatKit(
        taskId,
        store,
        options.respond,
        options.beforeStart,
      );
      kits.push(kit);
      return kit;
    },
  });
}

function complete(store: FakeStore, chat: SteerChat, result: string) {
  chat.appendOrReplaceMessage({
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [toolPart("attemptCompletion", crypto.randomUUID(), { result })],
  } as Message);
  store.setMessages("task", chat.messages);
  store.updateTaskStatus("task", "completed");
}

function task(id: string, status: string): TestTask {
  return { id, status, cwd: "/repo", background: true, error: null };
}

function userMessage(id: string, text: string): Message {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

function assistantText(id: string, text: string): Message {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text, state: "streaming" }],
  } as Message;
}

function toolPart(toolName: string, toolCallId: string, input: unknown) {
  return {
    type: `tool-${toolName}`,
    toolCallId,
    state: "input-available",
    input,
  } as Message["parts"][number];
}

function toolOutput(message: Message | undefined, toolCallId: string) {
  const part = message?.parts.find(
    (p) => "toolCallId" in p && p.toolCallId === toolCallId,
  ) as { output?: unknown } | undefined;
  return part?.output;
}

function textOf(message: Message | undefined) {
  return (message?.parts ?? [])
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for predicate");
}
