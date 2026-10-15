import {
  type BackgroundJobNotification,
  type BackgroundJobNotificationQueueEntry,
  type BackgroundMonitorNotification,
  acknowledgeBackgroundJobNotification,
  createBackgroundJobNotification,
  enqueueBackgroundJobNotification,
  getPendingBackgroundJobNotifications,
  snapshotPendingBackgroundJobNotifications,
} from "@getpochi/common";
import type { ChatInit, ChatStatus } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlobStore, LiveKitStore, Message, Task } from "../..";
import { makeJobStore } from "../../background-job/__tests__/test-store";
import { BackgroundJobManager } from "../../background-job/manager";
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
  vi.useRealTimers();
});
describe("LiveChatKit background job notification delivery", () => {
  it("shares the automatic progress cooldown across chat instances while explicit delivery bypasses it", async () => {
    vi.useFakeTimers();
    const { kit, push, store, setMessages } = await makeQueuedChatKit();
    push("first");
    expect(kit.flushBackgroundJobNotifications()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(kit.flushBackgroundJobNotifications()).toBe(true);
    await makeRequest(kit);
    setMessages("task-1", kit.chat.messages);
    await Promise.resolve();
    const secondKit = makeChatKit(undefined, store);
    secondKit.chat.messages = [...kit.chat.messages, assistantMessage()];
    push("second");
    expect(secondKit.flushBackgroundJobNotifications()).toBe(false);
    await vi.advanceTimersByTimeAsync(9999);
    expect(secondKit.flushBackgroundJobNotifications()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(secondKit.flushBackgroundJobNotifications()).toBe(true);
    await makeRequest(secondKit);
    setMessages("task-1", secondKit.chat.messages);
    await Promise.resolve();
    secondKit.chat.status = "ready";
    secondKit.chat.messages.push(assistantMessage());
    push("third");
    expect(secondKit.flushBackgroundJobNotifications()).toBe(false);
    expect(secondKit.flushBackgroundJobNotifications({ automatic: false })).toBe(true);
    expect(idsOf(secondKit.chat.messages.at(-1)!.parts)).toEqual(["third"]);
  });

  it("keeps accumulated output within the remaining per-request budget", async () => {
    const { kit, push, pending, setMessages } = await makeQueuedChatKit();
    const lines = ["x".repeat(8192)];
    for (let index = 0; index < 3; index++) {
      const backgroundJobId = `bgjob-monitor-${index}`;
      push(`head-${index}`, { lines, backgroundJobId });
      push(`buffer-${index}`, { lines, backgroundJobId });
    }
    expect(kit.flushBackgroundJobNotifications({ automatic: false })).toBe(true);
    await makeRequest(kit);
    const sent = idsOf(kit.chat.messages.at(-1)!.parts);
    expect(sent).toEqual(["head-0", "head-1", "head-2", "buffer-0"]);
    expect(pending()).toHaveLength(6);
    expect(idsOf(kit.pendingBackgroundJobNotifications)).toEqual(["buffer-1", "buffer-2"]);
    setMessages("task-1", kit.chat.messages);
    await Promise.resolve();
    kit.chat.messages.push(assistantMessage(), userMessage("continue"));
    await makeRequest(kit);
    expect(idsOf(kit.chat.messages.at(-1)!.parts)).toEqual(["buffer-1", "buffer-2"]);
  });

  it.each(["automatic", "user", "continuation"])(
    "includes accumulated output in the same %s request before acknowledging either snapshot",
    async (trigger) => {
      vi.useFakeTimers();
      const { kit, push, snapshotPending, acknowledge, setMessages, pending } = await makeQueuedChatKit();
      kit.chat.messages = trigger === "user"
        ? [assistantMessage(), userMessage("continue")]
        : [userMessage("watch"), assistantMessage()];
      push("first");
      push("second");
      push("third");
      expect(pending().map((item) => item.notificationId)).toEqual(["first"]);
      if (trigger === "automatic") {
        expect(kit.flushBackgroundJobNotifications()).toBe(false);
        await vi.advanceTimersByTimeAsync(1000);
        expect(kit.flushBackgroundJobNotifications()).toBe(true);
      }
      await makeRequest(kit);
      const parts = kit.chat.messages.at(-1)!.parts;
      expect(idsOf(parts)).toEqual(["first", "second"]);
      expect(parts.filter((part) => part.type === "data-background-job-notification").map((part) => part.data)).toMatchObject([
        { lines: ["first"] }, { lines: ["second", "third"] },
      ]);
      expect(snapshotPending).toHaveBeenCalledExactlyOnceWith();
      expect(acknowledge).not.toHaveBeenCalled();
      // Retrying a snapshot cannot duplicate it or acknowledge it early.
      await makeRequest(kit);
      expect(idsOf(kit.chat.messages.at(-1)!.parts)).toEqual(["first", "second"]);
      expect(pending()).toHaveLength(2);
      setMessages("task-1", kit.chat.messages);
      await Promise.resolve();
      expect(pending()).toEqual([]);
      expect(acknowledge.mock.calls.map(([id]) => id).sort()).toEqual(["first", "second"]);
    },
  );

  it("retains request snapshots if the request is aborted, including later output on a subsequent request", async () => {
    const { kit, push, pending, acknowledge, setMessages } = await makeQueuedChatKit();
    kit.chat.messages = [userMessage("watch")];
    push("first");
    push("second");
    const controller = new AbortController();
    controller.abort();
    await expect(makeRequest(kit, controller.signal)).rejects.toThrow();
    expect(acknowledge).not.toHaveBeenCalled();
    expect(idsOf(kit.chat.messages.at(-1)!.parts)).toEqual([]);
    push("later");
    await makeRequest(kit);
    expect(idsOf(kit.chat.messages.at(-1)!.parts)).toEqual(["first", "second"]);
    setMessages("task-1", kit.chat.messages);
    await Promise.resolve();
    expect(pending().map((item) => item.notificationId)).toEqual(["later"]);
    kit.chat.messages.push(assistantMessage(), userMessage("continue"));
    await makeRequest(kit);
    expect(idsOf(kit.chat.messages.at(-1)!.parts)).toEqual(["later"]);
  });

  it("reads all accumulated output even before the first observable notification arrives", async () => {
    const { kit, push, snapshotPending, acknowledge } = await makeQueuedChatKit({ publishUpdates: false });
    kit.chat.messages = [userMessage("continue")];
    push("first");
    push("second");
    push("third");
    push("other", { backgroundJobId: "bgjob-monitor-other" });
    expect(kit.backgroundJobManager.getPendingNotifications("task-1")).toEqual([]);
    await makeRequest(kit);
    expect(idsOf(kit.chat.messages.at(-1)!.parts)).toEqual(["first", "other", "second"]);
    expect(kit.chat.messages.at(-1)!.parts).toContainEqual(expect.objectContaining({
      type: "data-background-job-notification",
      data: expect.objectContaining({ notificationId: "second", lines: ["second", "third"] }),
    }));
    expect(snapshotPending).toHaveBeenCalledExactlyOnceWith();
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it("retries a failed snapshot read without attaching or acknowledging partial output", async () => {
    const { kit, push, snapshotPending, acknowledge } = await makeQueuedChatKit();
    kit.chat.messages = [userMessage("continue")];
    push("first");
    push("second");
    snapshotPending.mockRejectedValueOnce(new Error("source unavailable"));
    await expect(makeRequest(kit)).rejects.toThrow("source unavailable");
    expect(idsOf(kit.chat.messages.at(-1)!.parts)).toEqual([]);
    expect(acknowledge).not.toHaveBeenCalled();
    push("third");
    await makeRequest(kit);
    expect(idsOf(kit.chat.messages.at(-1)!.parts)).toEqual(["first", "second"]);
    expect(kit.chat.messages.at(-1)!.parts).toContainEqual(expect.objectContaining({
      type: "data-background-job-notification",
      data: expect.objectContaining({ notificationId: "second", lines: ["second", "third"] }),
    }));
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it("collects hidden output when a delivered head is still awaiting its source ACK", async () => {
    const { kit, push, acknowledge, setMessages } = await makeQueuedChatKit();
    // Hold the source ACK while the next user request is already starting.
    let release!: () => void;
    acknowledge.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    push("first");
    push("second");
    kit.chat.messages = [
      createBackgroundJobNotificationMessage(toBackgroundJobNotificationParts([{ ...monitorEvent("first"), lines: ["first"] }])),
      assistantMessage(), userMessage("continue"),
    ];
    setMessages("task-1", kit.chat.messages);
    expect(kit.backgroundJobManager.getPendingNotifications("task-1")).toEqual([]);
    try {
      await makeRequest(kit);
      expect(idsOf(kit.chat.messages.at(-1)!.parts)).toEqual(["second"]);
    } finally {
      release();
    }
  });

  it("attaches another monitor batch to the next request without waiting", async () => {
    const chatKit = makeChatKit();
    chatKit.chat.messages = [userMessage("watch")];
    const event = monitorEvent("first");
    chatKit.enqueueBackgroundJobNotifications([event]);
    await makeRequest(chatKit);
    chatKit.chat.messages.push(assistantMessage(), userMessage("continue"));
    chatKit.enqueueBackgroundJobNotifications([
      { ...event, notificationId: "next" },
    ]);
    await makeRequest(chatKit);
    expect(idsOf(chatKit.chat.messages.at(-1)!.parts)).toEqual(["next"]);
    expect(chatKit.pendingBackgroundJobNotifications).toEqual([]);
  });

  it.each(["submitted", "streaming"] as const)(
    "uses the live %s status to defer a stale idle caller",
    (status) => {
      const chatKit = makeChatKit();
      chatKit.chat.messages = [userMessage("watch"), assistantMessage()];
      chatKit.enqueueBackgroundJobNotifications([monitorEvent("event")]);
      chatKit.chat.status = status;
      expect(chatKit.flushBackgroundJobNotifications({ automatic: false })).toBe(false);
      expect(chatKit.chat.sentMessages).toHaveLength(0);
      expect(idsOf(chatKit.pendingBackgroundJobNotifications)).toEqual([
        "event",
      ]);
      chatKit.chat.status = "ready";
      expect(chatKit.flushBackgroundJobNotifications({ automatic: false })).toBe(true);
      expect(chatKit.chat.sentMessages).toHaveLength(1);
    },
  );

  it("retains the original notification after a synchronous host failure and deduplicates the retry", async () => {
    vi.useFakeTimers();
    const startTurn = vi.fn((_message: Message): void => {
      throw new Error("send failed");
    });
    const chatKit = makeChatKit({ startTurn });
    const event = monitorEvent("event");
    chatKit.chat.messages = [userMessage("watch"), assistantMessage()];
    chatKit.enqueueBackgroundJobNotifications([event]);
    expect(chatKit.flushBackgroundJobNotifications()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(chatKit.flushBackgroundJobNotifications()).toBe(false);
    expect(idsOf(chatKit.pendingBackgroundJobNotifications)).toEqual(["event"]);
    startTurn.mockImplementation((message) => {
      chatKit.chat.messages.push(message);
    });
    expect(chatKit.flushBackgroundJobNotifications()).toBe(true);
    chatKit.enqueueBackgroundJobNotifications([event]);
    expect(chatKit.flushBackgroundJobNotifications()).toBe(false);
    expect(startTurn).toHaveBeenCalledTimes(2);
    expect(idsOf(startTurn.mock.calls[1][0].parts)).toEqual(["event"]);
  });

  it("retains a batch when the SDK rejects before accepting its message", async () => {
    vi.useFakeTimers();
    const chatKit = makeChatKit();
    const send = vi
      .spyOn(chatKit.chat, "sendMessage")
      .mockRejectedValueOnce(new Error("send failed"));
    chatKit.enqueueBackgroundJobNotifications([monitorEvent("event")]);
    expect(chatKit.flushBackgroundJobNotifications()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(chatKit.flushBackgroundJobNotifications()).toBe(true);
    await Promise.resolve();
    expect(idsOf(chatKit.pendingBackgroundJobNotifications)).toEqual(["event"]);
    expect(chatKit.flushBackgroundJobNotifications()).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(idsOf(send.mock.calls[1][0].parts)).toEqual(["event"]);
    expect(chatKit.pendingBackgroundJobNotifications).toEqual([]);
  });

  it("shares one request budget between an idle flush and the request snapshot hook", async () => {
    const chatKit = makeChatKit();
    chatKit.chat.messages = [userMessage("watch"), assistantMessage()];
    chatKit.enqueueBackgroundJobNotifications(
      Array.from({ length: 6 }, (_, index) => ({
        ...monitorEvent(String(index)),
        backgroundJobId: `bgjob-monitor-${index}`,
        lines: Array.from({ length: 4 }, () => "x".repeat(2048)),
      })),
    );
    expect(chatKit.flushBackgroundJobNotifications({ automatic: false })).toBe(true);
    await makeRequest(chatKit);
    expect(idsOf(chatKit.chat.messages.at(-1)!.parts)).toEqual([
      "0",
      "1",
      "2",
      "3",
    ]);
    expect(idsOf(chatKit.pendingBackgroundJobNotifications)).toEqual([
      "4",
      "5",
    ]);
    chatKit.chat.messages.push(assistantMessage());
    chatKit.chat.status = "ready";
    expect(chatKit.flushBackgroundJobNotifications({ automatic: false })).toBe(true);
    await makeRequest(chatKit);
    expect(idsOf(chatKit.chat.messages.at(-1)!.parts)).toEqual(["4", "5"]);
    expect(chatKit.pendingBackgroundJobNotifications).toEqual([]);
  });
  it("keeps monitor events pending for a follow-up, then attaches and deduplicates them", async () => {
    const chatKit = makeChatKit();
    const event = { kind: "monitor" as const,
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
      { type: "data-background-job-notification", data: event },
    ]);
    chatKit.enqueueBackgroundJobNotifications([event]);
    expect(chatKit.pendingBackgroundJobNotifications).toEqual([]);
  });

  describe.each(["command", "subagent", "monitor"] as const)(
    "silenced %s notifications",
    (kind) => {
      it.each(["subscription", "flush", "next request"] as const)(
        "removes an already queued notice through %s without dropping other results",
        async (delivery) => {
          const data = makeJobStore();
          const manager = BackgroundJobManager.forStore(data.store);
          const notice =
            kind === "command"
              ? notifications("bgjob-cmd-1")[0]
              : kind === "monitor"
                ? monitorEvent("monitor-1:event-1")
                : subagentResult;
          let queued = kind === "subagent" ? [] : [notice];
          manager.connect({
            kill: async () => {},
            observeCommands: async (update) => {
              update({});
              return { dispose() {} };
            },
            observeNotifications: async (_taskId, update) => {
              update(queued);
              return {
                dispose() {},
                acknowledge: async (id) => {
                  queued = queued.filter((item) => item.notificationId !== id);
                  update(queued);
                },
              };
            },
          });
          if (kind === "subagent") {
            data.tasks.set("child-1", {
              id: "child-1",
              parentId: "task-1",
              background: true,
              status: "completed",
            } as Task);
            manager.registerTask("child-1", { parentTaskId: "task-1" });
          }
          const startTurn = vi.fn();
          const onPendingChange = vi.fn();
          const kit = new LiveChatKit<FakeChat>({
            taskId: "task-1",
            store: data.store,
            blobStore: {} as BlobStore,
            chatClass: FakeChat,
            getters: { getLLM: () => ({ id: "test-model" }) as never },
            backgroundJobManager: manager,
            backgroundJobNotifications: { startTurn, onPendingChange },
          });
          kit.chat.messages = [userMessage("run it"), assistantMessage()];
          await manager.watchTask("task-1");
          const unsubscribe = kit.subscribeBackgroundJobs();
          try {
            await vi.waitFor(() =>
              expect(kit.pendingBackgroundJobNotifications).toHaveLength(1),
            );
            if (delivery !== "subscription") unsubscribe();
            await manager.kill(notice.backgroundJobId, "task-1", {
              notify: false,
            });
            expect(manager.getPendingNotifications("task-1")).toEqual([]);
            if (delivery === "next request") {
              await makeRequest(kit);
              expect(
                kit.chat.messages.flatMap((message) =>
                  getBackgroundJobNotificationIds(message.parts),
                ),
              ).toEqual([]);
            } else if (delivery === "flush") {
              expect(kit.flushBackgroundJobNotifications()).toBe(false);
              expect(startTurn).not.toHaveBeenCalled();
            }
            expect(kit.pendingBackgroundJobNotifications).toEqual([]);
            expect(onPendingChange).toHaveBeenLastCalledWith([]);

            // A stale snapshot must not bring back the silenced result, while
            // unrelated results still reach the model.
            const other = notifications("bgjob-cmd-other")[0];
            kit.enqueueBackgroundJobNotifications([notice, other]);
            expect(idsOf(kit.pendingBackgroundJobNotifications)).toEqual([
              other.notificationId,
            ]);
            expect(kit.flushBackgroundJobNotifications()).toBe(true);
            expect(idsOf(startTurn.mock.calls[0][0].parts)).toEqual([
              other.notificationId,
            ]);
          } finally {
            unsubscribe();
            await manager.dispose();
          }
        },
      );
    },
  );

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
  store = new FakeStore() as unknown as LiveKitStore,
) {
  const kit = new LiveChatKit<FakeChat>({
    taskId: "task-1",
    store,
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
async function makeRequest(chatKit: LiveChatKit<FakeChat>, abortSignal = new AbortController().signal) {
  const chat = chatKit.chat as unknown as {
    onBeforeSnapshotInMakeRequest: (options: {
      abortSignal: AbortSignal;
    }) => Promise<void>;
  };
  await chat.onBeforeSnapshotInMakeRequest({
    abortSignal,
  });
}

async function makeQueuedChatKit({ publishUpdates = true } = {}) {
  const data = makeJobStore();
  const kit = makeChatKit(undefined, data.store);
  let queue: BackgroundJobNotificationQueueEntry[] = [];
  const pending = () => getPendingBackgroundJobNotifications(queue);
  let update = (_notifications: readonly BackgroundJobNotification[]) => {};
  const acknowledge = vi.fn(async (id: string) => {
    queue = acknowledgeBackgroundJobNotification(queue, id);
    update(pending());
  });
  const snapshotPending = vi.fn(async () => {
    const snapshot = snapshotPendingBackgroundJobNotifications(queue);
    queue = snapshot.queue;
    // Exercise an RPC response arriving before its observable update.
    return snapshot.notifications;
  });
  kit.backgroundJobManager.connect({
    kill: async () => {},
    observeCommands: async (onChange) => {
      onChange({});
      return { dispose() {} };
    },
    observeNotifications: async (_taskId, onChange) => {
      update = onChange;
      update(pending());
      return { acknowledge, snapshotPending, dispose() {} };
    },
  });
  await kit.backgroundJobManager.watchTask("task-1");
  return {
    ...data, kit, pending, snapshotPending, acknowledge,
    push(id: string, overrides: Partial<BackgroundMonitorNotification> = {}) {
      queue = enqueueBackgroundJobNotification(queue, { ...monitorEvent(id), lines: [id], ...overrides });
      if (publishUpdates) update(pending());
    },
  };
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
  status: ChatStatus = "ready";
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
    this.messages.push({ id: crypto.randomUUID(), role: "user", parts: message.parts });
    this.status = "submitted";
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

function monitorEvent(notificationId: string) {
  return { kind: "monitor" as const, notificationId, backgroundJobId: "bgjob-monitor-1", description: "CI",
    command: "watch", outputFile: "/tmp/watch.log", lines: ["passed"] };
}
