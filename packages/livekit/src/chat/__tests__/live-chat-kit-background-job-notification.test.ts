import {
  type BackgroundJobNotification,
  createBackgroundJobNotification,
} from "@getpochi/common";
import type { ChatInit } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { BlobStore, LiveKitStore, Message } from "../..";
import {
  type BackgroundJobNotificationPart,
  createBackgroundJobNotificationMessage,
  getBackgroundJobNotificationIds,
  toBackgroundJobNotificationParts,
} from "../background-job-notification";
import type { OnStartCallback } from "../flexible-chat-transport";
import type { LiveChatKitBackgroundJobNotificationOptions } from "../live-chat-kit";
import { LiveChatKit } from "../live-chat-kit";

describe("LiveChatKit background job notification delivery", () => {
  it("persists the checkpoint added to a notification continuation", async () => {
    const store = new FakeStore();
    const commit = vi.spyOn(store, "commit");
    const getters = { getLLM: () => ({ id: "test-model" }) as never };
    const checkpoint = {
      type: "data-checkpoint" as const,
      data: { commit: "checkpoint-after-tools" },
    };
    const chatKit = new LiveChatKit<FakeChat>({
      taskId: "task-1",
      store: store as unknown as LiveKitStore,
      blobStore: {} as BlobStore,
      chatClass: FakeChat,
      getters,
      onOverrideMessages: async ({ messages }) => {
        messages.at(-1)?.parts.push(checkpoint);
      },
    });
    vi.spyOn(chatKit, "inited", "get").mockReturnValue(true);
    vi.spyOn(chatKit, "task", "get").mockReturnValue({
      background: true,
    } as NonNullable<typeof chatKit.task>);
    chatKit.chat.messages = [userMessage("run it"), assistantMessage()];
    chatKit.enqueueBackgroundJobNotifications(notifications("bgjob-cmd-1"));

    await makeRequest(chatKit);
    await (chatKit as unknown as { onStart: OnStartCallback }).onStart({
      messages: chatKit.chat.messages,
      getters,
    });

    expect(commit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "v1.ChatStreamStarted",
        args: expect.objectContaining({
          data: expect.objectContaining({
            role: "user",
            parts: [
              expect.objectContaining({
                type: "data-background-job-notification",
              }),
              checkpoint,
            ],
          }),
        }),
      }),
    );
  });

  it("rides along with the user message that is being sent", async () => {
    const chatKit = makeChatKit();
    chatKit.chat.messages = [assistantMessage(), userMessage("fix it")];
    chatKit.enqueueBackgroundJobNotifications(notifications("bgjob-cmd-1"));

    await makeRequest(chatKit);

    expect(chatKit.chat.messages).toHaveLength(2);
    expect(
      getBackgroundJobNotificationIds(chatKit.chat.messages[1].parts),
    ).toEqual(["bgjob-cmd-1:terminal"]);
    expect(chatKit.pendingBackgroundJobNotifications).toEqual([]);
  });

  it("appends a message of its own to a continuation request", async () => {
    const chatKit = makeChatKit();
    chatKit.chat.messages = [userMessage("run it"), assistantMessage()];
    chatKit.enqueueBackgroundJobNotifications(notifications("bgjob-cmd-1"));

    await makeRequest(chatKit);

    expect(chatKit.chat.messages).toHaveLength(3);
    expect(chatKit.chat.messages[2].role).toBe("user");
  });

  it("leaves the messages untouched when nothing is pending", async () => {
    const chatKit = makeChatKit();
    const messages = [userMessage("run it"), assistantMessage()];
    chatKit.chat.messages = messages;

    await makeRequest(chatKit);

    expect(chatKit.chat.messages).toBe(messages);
  });

  it("reports the pending notifications to the host", () => {
    const onPendingChange = vi.fn();
    const chatKit = makeChatKit({ onPendingChange });
    chatKit.chat.messages = [userMessage("run it"), assistantMessage()];

    chatKit.enqueueBackgroundJobNotifications(notifications("bgjob-cmd-1"));

    expect(onPendingChange).toHaveBeenCalledTimes(1);
    expect(idsOf(onPendingChange.mock.calls[0][0])).toEqual([
      "bgjob-cmd-1:terminal",
    ]);
    expect(idsOf(chatKit.pendingBackgroundJobNotifications)).toEqual([
      "bgjob-cmd-1:terminal",
    ]);

    expect(chatKit.flushBackgroundJobNotifications()).toBe(true);
    expect(onPendingChange).toHaveBeenLastCalledWith([]);
  });

  it("ignores notifications that are pending or already delivered", () => {
    const onPendingChange = vi.fn();
    const chatKit = makeChatKit({ onPendingChange });
    chatKit.chat.messages = [
      userMessage("run it"),
      createBackgroundJobNotificationMessage(
        toBackgroundJobNotificationParts(notifications("bgjob-cmd-1")),
      ),
    ];

    chatKit.enqueueBackgroundJobNotifications(notifications("bgjob-cmd-1"));
    expect(chatKit.pendingBackgroundJobNotifications).toEqual([]);

    chatKit.enqueueBackgroundJobNotifications(notifications("bgjob-cmd-2"));
    chatKit.enqueueBackgroundJobNotifications(notifications("bgjob-cmd-2"));

    expect(idsOf(chatKit.pendingBackgroundJobNotifications)).toEqual([
      "bgjob-cmd-2:terminal",
    ]);
    expect(onPendingChange).toHaveBeenCalledTimes(1);
  });

  it("starts a turn of its own through the host sender", () => {
    const startTurn = vi.fn();
    const chatKit = makeChatKit({ startTurn });
    chatKit.chat.messages = [userMessage("run it"), assistantMessage()];
    chatKit.enqueueBackgroundJobNotifications(notifications("bgjob-cmd-1"));

    expect(chatKit.flushBackgroundJobNotifications()).toBe(true);
    expect(startTurn).toHaveBeenCalledTimes(1);
    expect(
      getBackgroundJobNotificationIds(startTurn.mock.calls[0][0].parts),
    ).toEqual(["bgjob-cmd-1:terminal"]);
  });

  it("sends on its own chat when the host has no sender", () => {
    const chatKit = makeChatKit();
    chatKit.chat.messages = [userMessage("run it"), assistantMessage()];
    chatKit.enqueueBackgroundJobNotifications(notifications("bgjob-cmd-1"));

    expect(chatKit.flushBackgroundJobNotifications()).toBe(true);
    expect(chatKit.chat.sentMessages).toHaveLength(1);
    expect(idsOf(chatKit.chat.sentMessages[0].parts)).toEqual([
      "bgjob-cmd-1:terminal",
    ]);
  });

  it("does not answer an unanswered follow-up question", () => {
    const startTurn = vi.fn();
    const chatKit = makeChatKit({ startTurn });
    chatKit.chat.messages = [userMessage("run it"), followupQuestionMessage()];
    chatKit.enqueueBackgroundJobNotifications(notifications("bgjob-cmd-1"));

    expect(chatKit.flushBackgroundJobNotifications()).toBe(false);
    expect(startTurn).not.toHaveBeenCalled();
    expect(idsOf(chatKit.pendingBackgroundJobNotifications)).toEqual([
      "bgjob-cmd-1:terminal",
    ]);
  });

  it("reports nothing started without pending notifications", () => {
    const startTurn = vi.fn();
    const chatKit = makeChatKit({ startTurn });
    chatKit.chat.messages = [userMessage("run it"), assistantMessage()];

    expect(chatKit.flushBackgroundJobNotifications()).toBe(false);
    expect(startTurn).not.toHaveBeenCalled();
  });
});

function makeChatKit(
  backgroundJobNotifications?: LiveChatKitBackgroundJobNotificationOptions,
) {
  return new LiveChatKit<FakeChat>({
    taskId: "task-1",
    store: new FakeStore() as unknown as LiveKitStore,
    blobStore: {} as BlobStore,
    chatClass: FakeChat,
    getters: {
      getLLM: () => ({ id: "test-model" }) as never,
    },
    backgroundJobNotifications,
  });
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

function idsOf(
  parts: readonly BackgroundJobNotificationPart[] | Message["parts"],
) {
  return getBackgroundJobNotificationIds(parts as Message["parts"]);
}

function notifications(
  ...backgroundJobIds: string[]
): BackgroundJobNotification[] {
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
  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text }],
  };
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
  messages: Message[];
  readonly sentMessages: { parts: Message["parts"] }[] = [];

  constructor(init: ChatInit<Message>) {
    this.messages = init.messages ?? [];
  }

  async stop() {}

  async sendMessage(message: { parts: Message["parts"] }) {
    this.sentMessages.push(message);
  }
}

class FakeStore {
  readonly storeId = "livekit-background-job-notification-test-store";

  query(query: { label?: string }) {
    if (query.label === "messages") return [];
    if (query.label === "task") return undefined;
    throw new Error(`Unsupported query ${query.label}`);
  }

  subscribe() {
    return () => {};
  }

  commit() {}
}
