import { createBackgroundJobNotification } from "@getpochi/common";
import type { ChatInit, ChatStatus } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlobStore, LiveKitStore, Message } from "../..";
import type { LiveChatKitPendingInputOptions } from "../live-chat-kit";
import { LiveChatKit } from "../live-chat-kit";
import type { QueuedUserInput } from "../pending-input";

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
});

function makeChatKit(pendingInput?: LiveChatKitPendingInputOptions) {
  const kit = new LiveChatKit<FakeChat>({
    taskId: "task-1",
    store: new FakeStore() as unknown as LiveKitStore,
    blobStore: {} as BlobStore,
    chatClass: FakeChat,
    getters: {
      getLLM: () => ({ id: "test-model" }) as never,
    },
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
  readonly sentMessages: { parts: Message["parts"] }[] = [];
  constructor(init: ChatInit<Message>) {
    this.messages = init.messages ?? [];
  }
  async stop() {}
  async sendMessage(message: { parts: Message["parts"] }) {
    this.sentMessages.push(message);
    this.messages.push({
      id: crypto.randomUUID(),
      role: "user",
      parts: message.parts,
    });
    this.status = "submitted";
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
