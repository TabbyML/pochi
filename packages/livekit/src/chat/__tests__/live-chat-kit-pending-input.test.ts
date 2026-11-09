import { createBackgroundJobNotification } from "@getpochi/common";
import type { ChatInit, ChatStatus } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlobStore, LiveKitStore, Message } from "../..";
import type { OnStartCallback } from "../flexible-chat-transport";
import type { LiveChatKitPendingInputOptions } from "../live-chat-kit";
import { LiveChatKit } from "../live-chat-kit";
import { type QueuedUserInput, detachUserInputParts } from "../pending-input";

const kits = new Set<LiveChatKit<FakeChat>>();

afterEach(async () => {
  await Promise.all([...kits].map((kit) => kit.backgroundJobManager.dispose()));
  kits.clear();
});

describe("LiveChatKit pending input", () => {
  it("queues and removes user inputs and reports every change", () => {
    const onChange = vi.fn();
    const kit = makeChatKit({ onChange });

    const firstId = kit.queueUserInput({
      parts: textParts("first"),
      display: { text: "first" },
    });
    const secondId = kit.queueUserInput({ parts: textParts("second") });

    expect(kit.pendingInput.userInputs.map((input) => input.id)).toEqual([
      firstId,
      secondId,
    ]);
    expect(onChange).toHaveBeenLastCalledWith({
      userInputs: kit.pendingInput.userInputs,
      notifications: [],
    });

    const removed = kit.removeUserInput(firstId);
    expect(removed?.display).toEqual({ text: "first" });
    expect(kit.removeUserInput(firstId)).toBeUndefined();
    expect(kit.pendingInput.userInputs.map((input) => input.id)).toEqual([
      secondId,
    ]);
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("attaches all queued user inputs to the continuation after tool calls", async () => {
    const onTakeUserInputs = vi.fn();
    const kit = makeChatKit({ onTakeUserInputs });
    kit.chat.messages = [userMessage("run it"), assistantMessage()];
    kit.queueUserInput({ parts: textParts("first") });
    kit.queueUserInput({ parts: textParts("second") });

    await makeRequest(kit);

    const lastMessage = kit.chat.messages.at(-1);
    expect(kit.chat.messages).toHaveLength(3);
    expect(lastMessage?.role).toBe("user");
    expect(lastMessage?.parts).toEqual([
      ...textParts("first"),
      ...textParts("second"),
    ]);
    expect(kit.pendingInput.userInputs).toEqual([]);
    expect(onTakeUserInputs).toHaveBeenCalledOnce();
    expect(
      onTakeUserInputs.mock.calls[0][0].map(
        (input: QueuedUserInput) => input.parts,
      ),
    ).toEqual([textParts("first"), textParts("second")]);
  });

  it("puts user inputs before notifications in the same request", async () => {
    const kit = makeChatKit();
    kit.chat.messages = [userMessage("run it"), assistantMessage()];
    kit.queueUserInput({ parts: textParts("steer") });
    kit.enqueueBackgroundJobNotifications(notifications("bgjob-cmd-1"));

    await makeRequest(kit);

    expect(kit.chat.messages.at(-1)?.parts.map((part) => part.type)).toEqual([
      "text",
      "data-background-job-notification",
    ]);
    expect(kit.pendingInput).toEqual({ userInputs: [], notifications: [] });
  });

  it("flushes all pending input as one message when idle", () => {
    const kit = makeChatKit();
    kit.chat.messages = [userMessage("run it"), assistantMessage()];
    kit.queueUserInput({ parts: textParts("first") });
    kit.queueUserInput({ parts: textParts("second") });
    kit.enqueueBackgroundJobNotifications(notifications("bgjob-cmd-1"));

    expect(kit.flushPendingInput()).toBe(true);

    expect(kit.chat.sentMessages).toHaveLength(1);
    expect(kit.chat.sentMessages[0].parts.map((part) => part.type)).toEqual([
      "text",
      "text",
      "data-background-job-notification",
    ]);
    expect(kit.pendingInput).toEqual({ userInputs: [], notifications: [] });
  });

  it("does not flush while a request is in flight", () => {
    const kit = makeChatKit();
    kit.chat.status = "streaming";
    kit.queueUserInput({ parts: textParts("later") });

    expect(kit.flushPendingInput()).toBe(false);
    expect(kit.pendingInput.userInputs).toHaveLength(1);
  });

  it("lets queued user input answer a follow-up question", () => {
    const kit = makeChatKit();
    kit.chat.messages = [userMessage("run it"), followupQuestionMessage()];
    kit.enqueueBackgroundJobNotifications(notifications("bgjob-cmd-1"));

    expect(kit.flushPendingInput()).toBe(false);

    kit.queueUserInput({ parts: textParts("answer") });
    expect(kit.flushPendingInput()).toBe(true);
    expect(kit.chat.sentMessages[0].parts.map((part) => part.type)).toEqual([
      "text",
      "data-background-job-notification",
    ]);
  });

  it("puts user inputs back when the turn fails to start", () => {
    const startTurn = vi.fn(() => {
      throw new Error("boom");
    });
    const kit = makeChatKit({ startTurn });
    kit.queueUserInput({ parts: textParts("first") });

    expect(kit.flushPendingInput()).toBe(false);
    expect(kit.pendingInput.userInputs.map((input) => input.parts)).toEqual([
      textParts("first"),
    ]);
  });

  it("restores stored inputs and persists every change after loading", async () => {
    const stored: QueuedUserInput = {
      id: "stored",
      parts: textParts("stored"),
    };
    let resolveLoad: (inputs: QueuedUserInput[]) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<QueuedUserInput[]>((resolve) => {
          resolveLoad = resolve;
        }),
    );
    const save = vi.fn(async (_inputs: readonly QueuedUserInput[]) => {});
    const kit = makeChatKit({ storage: { load, save } });

    // Queued before the stored inputs are loaded.
    const localId = kit.queueUserInput({ parts: textParts("local") });
    await Promise.resolve();
    expect(save).not.toHaveBeenCalled();

    resolveLoad([stored]);
    await vi.waitFor(() => expect(save).toHaveBeenCalled());

    expect(kit.pendingInput.userInputs.map((input) => input.id)).toEqual([
      "stored",
      localId,
    ]);
    expect(save.mock.lastCall?.[0].map((input) => input.id)).toEqual([
      "stored",
      localId,
    ]);

    kit.removeUserInput("stored");
    await vi.waitFor(() =>
      expect(save.mock.lastCall?.[0].map((input) => input.id)).toEqual([
        localId,
      ]),
    );
  });

  it("attaches stored inputs before inputs queued while loading", async () => {
    let resolveLoad: (inputs: QueuedUserInput[]) => void = () => {};
    const load = () =>
      new Promise<QueuedUserInput[]>((resolve) => {
        resolveLoad = resolve;
      });
    const kit = makeChatKit({ storage: { load, save: async () => {} } });
    kit.chat.messages = [userMessage("run it"), assistantMessage()];
    kit.queueUserInput({ parts: textParts("local") });

    expect(kit.flushPendingInput()).toBe(false);

    const request = makeRequest(kit);
    await Promise.resolve();
    resolveLoad([{ id: "stored", parts: textParts("stored") }]);
    await request;

    expect(kit.chat.messages.at(-1)?.parts).toEqual([
      ...textParts("stored"),
      ...textParts("local"),
    ]);
    expect(kit.pendingInput.userInputs).toEqual([]);
  });

  it("keeps attached inputs stored until the conversation persists them", async () => {
    const save = vi.fn(async (_inputs: readonly QueuedUserInput[]) => {});
    const kit = makeChatKit({ storage: { load: async () => [], save } });
    kit.chat.messages = [userMessage("run it"), assistantMessage()];
    const id = kit.queueUserInput({ parts: textParts("steer") });
    await vi.waitFor(() =>
      expect(save.mock.lastCall?.[0].map((input) => input.id)).toEqual([id]),
    );

    await makeRequest(kit);
    expect(kit.pendingInput.userInputs).toEqual([]);
    const savesBeforeStart = save.mock.calls.length;
    await flushStorage();
    expect(save.mock.calls.length).toBe(savesBeforeStart);

    await startStream(kit);
    await vi.waitFor(() => expect(save.mock.lastCall?.[0]).toEqual([]));
  });

  it("puts flushed inputs back when the send fails before persisting", async () => {
    const save = vi.fn(async (_inputs: readonly QueuedUserInput[]) => {});
    const kit = makeChatKit({ storage: { load: async () => [], save } });
    await flushStorage();
    kit.chat.messages = [userMessage("run it"), assistantMessage()];
    const messagesBefore = [...kit.chat.messages];
    const id = kit.queueUserInput({ parts: textParts("steer") });
    kit.chat.failNextSend = true;

    expect(kit.flushPendingInput()).toBe(true);
    await vi.waitFor(() =>
      expect(kit.pendingInput.userInputs.map((input) => input.id)).toEqual([
        id,
      ]),
    );

    expect(kit.chat.messages).toEqual(messagesBefore);
    await vi.waitFor(() =>
      expect(save.mock.lastCall?.[0].map((input) => input.id)).toEqual([id]),
    );
  });

  it("keeps flushed inputs delivered once their message was persisted", async () => {
    const kit = makeChatKit();
    kit.chat.messages = [userMessage("run it"), assistantMessage()];
    kit.queueUserInput({ parts: textParts("steer") });
    kit.chat.failNextSend = true;
    kit.chat.onSend = () => startStream(kit);

    expect(kit.flushPendingInput()).toBe(true);
    await flushStorage();

    expect(kit.pendingInput.userInputs).toEqual([]);
    expect(kit.chat.messages.at(-1)?.parts).toEqual(textParts("steer"));
  });
});

describe("detachUserInputParts", () => {
  it("removes only the given parts and drops an emptied message", () => {
    const kept = userMessage("kept");
    const extended: Message = {
      ...kept,
      parts: [...kept.parts, ...textParts("steer")],
    };
    expect(
      detachUserInputParts([extended], kept.id, textParts("steer")),
    ).toEqual([kept]);

    const added = userMessage("steer");
    expect(
      detachUserInputParts([kept, added], added.id, textParts("steer")),
    ).toEqual([kept]);
  });

  it("returns undefined when nothing matches", () => {
    const message = userMessage("kept");
    expect(
      detachUserInputParts([message], "missing", textParts("kept")),
    ).toBeUndefined();
    expect(
      detachUserInputParts([message], message.id, textParts("other")),
    ).toBeUndefined();
  });
});

const getters = { getLLM: () => ({ id: "test-model" }) as never };

function makeChatKit(pendingInput?: LiveChatKitPendingInputOptions) {
  const kit = new LiveChatKit<FakeChat>({
    taskId: "task-1",
    store: new FakeStore() as unknown as LiveKitStore,
    blobStore: {} as BlobStore,
    chatClass: FakeChat,
    getters,
    pendingInput,
  });
  kits.add(kit);
  return kit;
}

/** Runs the hook the patched ai-sdk calls right before it snapshots. */
async function makeRequest(chatKit: LiveChatKit<FakeChat>) {
  const chat = chatKit.chat as unknown as {
    onBeforeSnapshotInMakeRequest: (options: {
      abortSignal: AbortSignal;
    }) => Promise<void>;
  };
  await chat.onBeforeSnapshotInMakeRequest({
    abortSignal: new AbortController().signal,
  });
}

/** Runs the transport callback that persists the request's last message. */
async function startStream(chatKit: LiveChatKit<FakeChat>) {
  vi.spyOn(chatKit, "inited", "get").mockReturnValue(true);
  vi.spyOn(chatKit, "task", "get").mockReturnValue({
    background: true,
  } as NonNullable<typeof chatKit.task>);
  await (chatKit as unknown as { onStart: OnStartCallback }).onStart({
    messages: chatKit.chat.messages,
    getters,
  });
}

async function flushStorage() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function textParts(text: string): Message["parts"] {
  return [{ type: "text", text }];
}

function notifications(...backgroundJobIds: string[]) {
  return backgroundJobIds.map((backgroundJobId) =>
    createBackgroundJobNotification({
      taskId: "task-1",
      backgroundJobId,
      outputFile: `/tmp/${backgroundJobId}.log`,
      status: "completed",
      command: `run ${backgroundJobId}`,
      exitCode: 0,
      finishedAt: 1,
    }),
  );
}

function userMessage(text: string): Message {
  return { id: crypto.randomUUID(), role: "user", parts: textParts(text) };
}

function assistantMessage(): Message {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [{ type: "text", text: "on it" }],
  };
}

function followupQuestionMessage(): Message {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [
      { type: "step-start" },
      {
        type: "tool-askFollowupQuestion",
        toolCallId: "call-1",
        state: "input-available",
        input: { questions: [] },
      },
    ],
  };
}

class FakeChat {
  status: ChatStatus = "ready";
  messages: Message[];
  readonly sentMessages: { id?: string; parts: Message["parts"] }[] = [];
  /** Makes the next send fail after adding its message, like the SDK. */
  failNextSend = false;
  /** Runs once the message is added, before a failure is reported. */
  onSend?: () => Promise<void>;
  constructor(init: ChatInit<Message>) {
    this.messages = init.messages ?? [];
  }
  async stop() {}
  async sendMessage(message: { id?: string; parts: Message["parts"] }) {
    this.sentMessages.push(message);
    this.messages = [
      ...this.messages,
      {
        id: message.id ?? crypto.randomUUID(),
        role: "user",
        parts: message.parts,
      },
    ];
    this.status = "submitted";
    await this.onSend?.();
    if (this.failNextSend) {
      this.failNextSend = false;
      this.status = "error";
      throw new Error("send failed");
    }
  }
}

class FakeStore {
  readonly storeId = "livekit-pending-input-test-store";
  query(query: { label?: string }) {
    if (query.label === "messages" || query.label === "backgroundJobs")
      return [];
    if (query.label === "task") return undefined;
    throw new Error(`Unsupported query ${query.label}`);
  }
  subscribe() {
    return () => {};
  }
  commit() {}
}
