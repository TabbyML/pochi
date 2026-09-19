import {
  type BackgroundJobNotification,
  createBackgroundJobNotification,
} from "@getpochi/common";
import type { ChatInit } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlobStore, LiveKitStore, Message } from "../..";
import {
  createBackgroundJobNotificationMessage,
  getBackgroundJobNotificationIds,
  toBackgroundJobNotificationParts,
} from "../background-job-notification";
import type { OnStartCallback } from "../flexible-chat-transport";
import type { LiveChatKitBackgroundJobNotificationOptions } from "../live-chat-kit";
import { LiveChatKit } from "../live-chat-kit";
const kits = new Set<LiveChatKit<FakeChat>>();
afterEach(async () => {
  await Promise.all([...kits].map((kit) => kit.backgroundJobManager.dispose()));
  kits.clear();
});
describe("LiveChatKit background job notification delivery", () => {
  it("notifies an idle host when queued monitors become eligible, and defers piggyback delivery too", async () => {
    vi.useFakeTimers();
    const onPendingChange = vi.fn();
    const chatKit = makeChatKit({ onPendingChange });
    const unsubscribe = chatKit.subscribeBackgroundJobs();
    try {
      await chatKit.backgroundJobManager.watchTask("task-1");
      chatKit.chat.messages = [userMessage("watch")];
      const event = {
        notificationId: "first", backgroundJobId: "bgjob-monitor-1", description: "CI",
        command: "watch", outputFile: "/tmp/watch.log", lines: ["passed"],
      };
      chatKit.enqueueBackgroundJobNotifications([event]);
      await makeRequest(chatKit);
      const next = { ...event, notificationId: "next" };
      chatKit.enqueueBackgroundJobNotifications([next]);
      onPendingChange.mockClear();
      await makeRequest(chatKit);
      expect(idsOf(chatKit.pendingBackgroundJobNotifications)).toEqual(["next"]);
      expect(onPendingChange).not.toHaveBeenCalled(); // No React render loop while cooling down.
      expect(chatKit.flushBackgroundJobNotifications()).toBe(false);
      await vi.advanceTimersByTimeAsync(6000);
      expect(onPendingChange).toHaveBeenCalledOnce();
      expect(chatKit.flushBackgroundJobNotifications()).toBe(true);
      expect(idsOf(chatKit.chat.sentMessages[0].parts)).toEqual(["next"]);
    } finally {
      unsubscribe();
      await chatKit.backgroundJobManager.dispose();
      vi.useRealTimers();
    }
  });

  it("retains the original notification ID after a failed send and prevents concurrent sends", async () => {
    vi.useFakeTimers();
    let reject: (error: Error) => void = () => {};
    const startTurn = vi.fn((_message: Message) => new Promise<void>((_resolve, fail) => { reject = fail; }));
    const chatKit = makeChatKit({ startTurn });
    try {
      chatKit.chat.messages = [userMessage("watch"), assistantMessage()];
      const event = {
        notificationId: "event", backgroundJobId: "bgjob-monitor-1", description: "CI",
        command: "watch", outputFile: "/tmp/watch.log", lines: ["passed"],
      };
      chatKit.enqueueBackgroundJobNotifications([event]);
      expect(chatKit.flushBackgroundJobNotifications()).toBe(true);
      chatKit.enqueueBackgroundJobNotifications([event]);
      await vi.advanceTimersByTimeAsync(6000);
      expect(chatKit.flushBackgroundJobNotifications()).toBe(false);
      reject(new Error("send failed"));
      await vi.advanceTimersByTimeAsync(0);
      expect(idsOf(chatKit.pendingBackgroundJobNotifications)).toEqual(["event"]);
      startTurn.mockImplementation(async () => {});
      expect(chatKit.flushBackgroundJobNotifications()).toBe(true);
      expect(startTurn).toHaveBeenCalledTimes(2);
      expect(idsOf(startTurn.mock.calls[1][0].parts)).toEqual(["event"]);
    } finally {
      await chatKit.backgroundJobManager.dispose();
      vi.useRealTimers();
    }
  });

  it("keeps monitor events pending for a follow-up, then attaches and deduplicates them", async () => {
    const chatKit = makeChatKit();
    const event = {
      notificationId: "monitor-1:event-1",
      backgroundJobId: "bgjob-monitor-1",
      description: "CI",
      command: "watch",
      outputFile: "/tmp/watch.log",
      lines: ["check passed"],
    };
    chatKit.chat.messages = [
      userMessage("watch CI"),
      followupQuestionMessage(),
    ];
    chatKit.enqueueBackgroundJobNotifications([event]);
    expect(chatKit.flushBackgroundJobNotifications()).toBe(false);
    chatKit.chat.messages.push(userMessage("continue"));
    await makeRequest(chatKit);
    expect(chatKit.chat.messages.at(-1)?.parts).toEqual([
      { type: "text", text: "continue" },
      { type: "data-monitor-events", data: { batches: [event] } },
    ]);
    chatKit.enqueueBackgroundJobNotifications([event]);
    expect(chatKit.pendingBackgroundJobNotifications).toEqual([]);
  });

  it("delivers mixed subagent and command notifications with the next user request", async () => {
    const chatKit = makeChatKit();
    chatKit.chat.messages = [assistantMessage(), userMessage("continue")];
    chatKit.enqueueBackgroundJobNotifications([subagentResult]);
    chatKit.enqueueBackgroundJobNotifications(notifications("bgjob-cmd-1"));
    await makeRequest(chatKit);
    expect(chatKit.chat.messages).toHaveLength(2);
    expect(chatKit.chat.messages[1].parts.map((part) => part.type)).toEqual([
      "text",
      "data-background-job-notification",
      "data-background-job-notification",
    ]);
    expect(chatKit.pendingBackgroundJobNotifications).toEqual([]);
  });
  it("deduplicates task outcomes but delivers a different terminal status", async () => {
    const chatKit = makeChatKit();
    chatKit.chat.messages = [userMessage("continue")];
    chatKit.enqueueBackgroundJobNotifications([subagentResult, subagentResult]);
    chatKit.enqueueBackgroundJobNotifications([subagentResult]);
    expect(chatKit.pendingBackgroundJobNotifications).toHaveLength(1);
    await makeRequest(chatKit);
    const resumed = makeChatKit();
    resumed.chat.messages = chatKit.chat.messages;
    const retried = {
      ...subagentResult,
      notificationId: "bgjob-task-child-1:terminal:failed",
      status: "failed" as const,
    };
    resumed.enqueueBackgroundJobNotifications([subagentResult, retried]);
    expect(resumed.pendingBackgroundJobNotifications).toEqual([
      {
        type: "data-background-job-notification",
        data: retried,
      },
    ]);
  });
  it("defers subagent notifications during follow-up and flushes through the host", () => {
    const startTurn = vi.fn();
    const chatKit = makeChatKit({ startTurn });
    chatKit.chat.messages = [userMessage("run it"), followupQuestionMessage()];
    chatKit.enqueueBackgroundJobNotifications([subagentResult]);
    expect(chatKit.flushBackgroundJobNotifications()).toBe(false);
    expect(startTurn).not.toHaveBeenCalled();
    expect(chatKit.pendingBackgroundJobNotifications).toHaveLength(1);
    chatKit.chat.messages.push(userMessage("yes"));
    expect(chatKit.flushBackgroundJobNotifications()).toBe(true);
    expect(startTurn.mock.calls[0][0].parts).toEqual([
      {
        type: "data-background-job-notification",
        data: subagentResult,
      },
    ]);
    expect(chatKit.pendingBackgroundJobNotifications).toEqual([]);
  });
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
    await (
      chatKit as unknown as {
        onStart: OnStartCallback;
      }
    ).onStart({
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
  const kit = new LiveChatKit<FakeChat>({
    taskId: "task-1",
    store: new FakeStore() as unknown as LiveKitStore,
    blobStore: {} as BlobStore,
    chatClass: FakeChat,
    getters: {
      getLLM: () => ({ id: "test-model" }) as never,
    },
    backgroundJobNotifications,
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
function idsOf(parts: readonly Message["parts"][number][]) {
  return getBackgroundJobNotificationIds(parts);
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
  readonly sentMessages: {
    parts: Message["parts"];
  }[] = [];
  constructor(init: ChatInit<Message>) {
    this.messages = init.messages ?? [];
  }
  async stop() {}
  async sendMessage(message: {
    parts: Message["parts"];
  }) {
    this.sentMessages.push(message);
  }
}
class FakeStore {
  readonly storeId = "livekit-background-job-notification-test-store";
  query(query: {
    label?: string;
  }) {
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
const subagentResult = {
  kind: "subagent" as const,
  notificationId: "bgjob-task-child-1:terminal:completed",
  backgroundJobId: "bgjob-task-child-1",
  taskId: "child-1",
  status: "completed" as const,
  result: "finished",
};

it("writes the original description before a background subagent sends its first message", async () => {
  const task = {
    id: "child",
    background: true,
    parentId: "parent",
    title: null,
  };
  const commit = vi.fn();
  const store = {
    storeId: "test",
    query: (query: { label?: string }) =>
      query.label === "task"
        ? task
        : [
            {
              data: {
                id: "parent",
                role: "assistant",
                parts: [
                  {
                    type: "tool-newTask",
                    state: "output-available",
                    input: {
                      agentType: "explore",
                      description: "Inspect test setup",
                      prompt: "Inspect repository tests",
                      _meta: { uid: "child" },
                    },
                  },
                ],
              },
            },
          ],
    subscribe: () => () => {},
    commit,
  } as unknown as LiveKitStore;
  const getters = { getLLM: () => ({ id: "test-model" }) as never };
  const chatKit = new LiveChatKit<FakeChat>({
    taskId: "child",
    store,
    blobStore: {} as BlobStore,
    chatClass: FakeChat,
    getters,
    isSubTask: true,
  });
  vi.spyOn(chatKit, "inited", "get").mockReturnValue(true);
  await (chatKit as unknown as { onStart: OnStartCallback }).onStart({
    messages: [userMessage("Inspect repository tests")],
    getters,
  });
  expect(commit).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "v1.UpdateTitle",
      args: expect.objectContaining({
        id: "child",
        title: "Inspect test setup",
      }),
    }),
  );
  expect(commit.mock.calls[0][0].name).toBe("v1.UpdateTitle");
  expect(commit.mock.calls[1][0].name).toBe("v1.ChatStreamStarted");
});
