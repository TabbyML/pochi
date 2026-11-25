import { toBackgroundJobNotificationParts } from "../chat/background-job-notification";
import type { BackgroundJobNotification } from "@getpochi/common";
import type { BackgroundCommands } from "@getpochi/common/vscode-webui-bridge";
import { createBackgroundJobNotification } from "@getpochi/common";
import { describe, expect, it, vi } from "vitest";
import type { RunningTaskAdaptor } from "../background-task/task-executor/task-executor";
import type { Message, Task } from "../types";
import { makeJobStore } from "./__tests__/test-store";
import { BackgroundJobManager, type BackgroundCommandAdaptor } from "./manager";

function setup() {
  const data = makeJobStore();
  const pending = new Map<string, readonly BackgroundJobNotification[]>();
  const notificationObservers = new Map<
    string,
    (notifications: readonly BackgroundJobNotification[]) => void
  >();
  const observers = new Map<
    string,
    (snapshot: {
      running: BackgroundCommands;
      notifications: BackgroundJobNotification[];
    }) => void
  >();
  let commandsChanged: Parameters<
    BackgroundCommandAdaptor["observeCommands"]
  >[0];
  const source = {
    kill: vi.fn(async (_id: string) => {}),
    observeCommands: vi.fn(
      async (
        update: Parameters<BackgroundCommandAdaptor["observeCommands"]>[0],
      ) => {
        commandsChanged = update;
        update({});
        return { dispose: vi.fn() };
      },
    ),
    observeNotifications: vi.fn(
      async (
        taskId: string,
        update: Parameters<BackgroundCommandAdaptor["observeNotifications"]>[1],
      ) => {
        observers.set(taskId, (snapshot) => {
          commandsChanged(snapshot.running);
          pending.set(taskId, snapshot.notifications);
          update(snapshot.notifications);
        });
        notificationObservers.set(taskId, update);
        update(pending.get(taskId) ?? []);
        return { dispose: vi.fn(), acknowledge };
      },
    ),
  };
  const acknowledge = vi.fn(async (id: string) => {
    for (const [taskId, notifications] of pending) {
      const remaining = notifications.filter(
        (notice) => notice.notificationId !== id,
      );
      pending.set(taskId, remaining);
      notificationObservers.get(taskId)?.(remaining);
    }
  });
  const manager = BackgroundJobManager.forStore(data.store);
  manager.connect(source);
  return { ...data, manager, source, acknowledge, observers, pending };
}
const running = (taskId: string) => ({
  taskId,
  command: "test",
  outputFile: "/tmp/output",
  isVisible: false,
});
const monitored = (id = "bgjob-monitor-one") => ({ kind: "monitor" as const,
  notificationId: `monitor:${id}`,
  backgroundJobId: id,
  description: "watch",
  command: "watch",
  outputFile: "/tmp/watch.log",
  lines: ["output from before the restart"],
});
const finished = (id = "bgjob-cmd-one") =>
  createBackgroundJobNotification({
    taskId: "parent",
    backgroundJobId: id,
    command: "test",
    outputFile: "/tmp/output",
    status: "completed",
    finishedAt: 1,
  });
const stopped = (id = "bgjob-cmd-one") =>
  createBackgroundJobNotification({
    taskId: "parent",
    backgroundJobId: id,
    command: "test",
    outputFile: "/tmp/output",
    status: "stopped",
    finishedAt: 1,
  });

describe("BackgroundJobManager", () => {
  it("does not postpone a burst's deadline and keeps independent task wakeups separate", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { manager, observers } = setup();
    try {
      await manager.watchTask("parent");
      await manager.watchTask("other");
      const event = monitored();
      observers.get("parent")!({ running: {}, notifications: [event] });
      for (let index = 0; index < 4; index++) {
        await vi.advanceTimersByTimeAsync(200);
        observers.get("parent")!({ running: {}, notifications: [event, { ...event, notificationId: String(index) }] });
        expect(manager.getReadyNotifications("parent")).toEqual([]);
      }
      await vi.advanceTimersByTimeAsync(200);
      expect(manager.getReadyNotifications("parent")).toHaveLength(2);
      manager.startNotificationTurn("parent");
      observers.get("other")!({ running: {}, notifications: [monitored("bgjob-monitor-other")] });
      await vi.advanceTimersByTimeAsync(1000);
      expect(manager.getReadyNotifications("parent")).toEqual([]);
      expect(manager.getReadyNotifications("other")).toHaveLength(1);
      // Command completion remains urgent even during progress cooldown.
      observers.get("parent")!({ running: {}, notifications: [event, finished()] });
      expect(manager.getReadyNotifications("parent")).toEqual([finished(), event]);
    } finally {
      await manager.dispose();
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    }
  });

  it("wakes subscribers and waiters for a lone progress event, then shares the cooldown across senders", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { manager, observers, setMessages } = setup();
    try {
      await manager.watchTask("parent");
      const listener = vi.fn();
      const unsubscribe = manager.subscribeNotifications("parent", listener);
      await Promise.resolve();
      const event = monitored();
      observers.get("parent")!({ running: {}, notifications: [event] });
      const waiting = manager.wait("parent", { wakeOnNotifications: true });
      expect(manager.getReadyNotifications("parent")).toEqual([]);
      await vi.advanceTimersByTimeAsync(999);
      expect(manager.getReadyNotifications("parent")).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(await waiting).toBe("notifications");
      expect(listener).toHaveBeenLastCalledWith([event], true);
      manager.startNotificationTurn("parent");
      setMessages("parent", [{ id: "delivered", role: "user", parts: toBackgroundJobNotificationParts([event]) }]);
      const next = { ...event, notificationId: "next" };
      observers.get("parent")!({ running: {}, notifications: [next] });
      expect(manager.takeReadyNotifications("parent", [next], undefined, true)).toEqual([]);
      await vi.advanceTimersByTimeAsync(9_999);
      expect(manager.getReadyNotifications("parent")).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);
      expect(manager.takeReadyNotifications("parent", [next], undefined, true)).toEqual([next]);
      unsubscribe();
    } finally {
      await manager.dispose();
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    }
  });

  it("lets user requests and endings bypass the automatic progress delay", async () => {
    vi.useFakeTimers();
    const { manager, observers } = setup();
    try {
      await manager.watchTask("parent");
      const event = monitored();
      observers.get("parent")!({ running: {}, notifications: [event] });
      expect(manager.takeReadyNotifications("parent", [event], undefined, true)).toEqual([]);
      expect(manager.takeReadyNotifications("parent", [event])).toEqual([event]);
      expect(vi.getTimerCount()).toBe(0);
      manager.startNotificationTurn("parent");
      const ended = { ...event, notificationId: "ended", ended: { reason: "done", status: "completed" as const } };
      observers.get("parent")!({ running: {}, notifications: [event, ended] });
      expect(await manager.wait("parent", { wakeOnNotifications: true })).toBe("notifications");
      expect(manager.takeReadyNotifications("parent", [event, ended], undefined, true)).toEqual([event, ended]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      await manager.dispose();
      vi.useRealTimers();
    }
  });

  it("disposes commands and monitors throughout the store, including jobs owned by completed children", async () => {
    const { manager, tasks, observers, source, store } = setup();
    for (const [id, parentId, background, status] of [
      ["parent", null, false, "pending-tool"],
      ["child", "parent", true, "completed"],
      ["grandchild", "child", true, "pending-model"],
      ["fork", null, true, "pending-tool"],
    ] as const) tasks.set(id, { id, parentId, background, status } as Task);
    manager.registerTask("child", { parentTaskId: "parent" });
    manager.registerTask("grandchild", { parentTaskId: "child" });
    manager.registerTask("fork", { parentTaskId: "parent", useCase: "task-memory" });
    await manager.watchTask("parent");
    observers.get("parent")!({ running: {
      "bgjob-cmd-root": running("parent"),
      "bgjob-cmd-child": running("child"),
      "bgjob-monitor-grandchild": { ...running("grandchild"), monitor: "watch" },
      "bgjob-cmd-unrelated": running("other-tab"),
    }, notifications: [] });
    await manager.dispose();
    await manager.dispose();
    expect(source.kill.mock.calls.map(([id]) => id).sort()).toEqual([
      "bgjob-cmd-child", "bgjob-cmd-root", "bgjob-monitor-grandchild",
    ]);
    expect(tasks.get("child")?.status).toBe("completed");
    expect(BackgroundJobManager.forStore(store)).not.toBe(manager);
  });

  it("still stops other jobs and disposes when one command fails to stop", async () => {
    const { manager, observers, source, tasks } = setup();
    tasks.set("parent", { id: "parent", status: "pending-tool" } as Task);
    await manager.watchTask("parent");
    observers.get("parent")!({ running: {
      "bgjob-cmd-one": running("parent"), "bgjob-cmd-two": running("parent"),
    }, notifications: [] });
    source.kill.mockRejectedValueOnce(new Error("failed to kill"));
    await expect(manager.dispose()).rejects.toThrow("failed to kill");
    expect(source.kill).toHaveBeenCalledTimes(2);
    await expect(manager.backgroundSubTask({ taskId: "late", parentTaskId: "parent" })).rejects.toThrow("disposed");
  });

  it("wakes immediately for the final monitor event after a previous delivery", async () => {
    vi.useFakeTimers();
    const { manager, observers } = setup();
    try {
      await manager.watchTask("parent");
      const ended = { kind: "monitor" as const,
        notificationId: "monitor:end", backgroundJobId: "bgjob-monitor-watch",
        description: "watch", command: "watch", outputFile: "/tmp/watch.log",
        lines: ["last output"], ended: { reason: "done", status: "completed" as const },
      };
      manager.takeReadyNotifications("parent", [{ ...ended, notificationId: "previous", ended: undefined }]);
      observers.get("parent")!({ running: {}, notifications: [ended] });
      expect(manager.hasPending("parent")).toBe(false);
      expect(await manager.wait("parent", { wakeOnNotifications: true })).toBe("notifications");
      expect(vi.getTimerCount()).toBe(0);
      expect(manager.takeReadyNotifications("parent", manager.getPendingNotifications("parent"))).toEqual([ended]);
    } finally {
      await manager.dispose();
      vi.useRealTimers();
    }
  });

  it("retries a failed source acknowledgement without another event", async () => {
    vi.useFakeTimers();
    const { manager, observers, acknowledge, setMessages } = setup();
    try {
      await manager.watchTask("parent");
      acknowledge.mockRejectedValueOnce(new Error("temporary storage failure"));
      const notice = finished();
      observers.get("parent")!({ running: {}, notifications: [notice] });
      setMessages("parent", [{ id: "delivery", role: "user", parts: toBackgroundJobNotificationParts([notice]) }]);
      await vi.advanceTimersByTimeAsync(1000);
      expect(acknowledge).toHaveBeenCalledTimes(2);
      expect(manager.getPendingNotifications("parent")).toEqual([]);
    } finally {
      await manager.dispose();
      vi.useRealTimers();
    }
  });

  it("writes a subagent's transcript under its parent through the adaptor", async () => {
    const { manager, tasks } = setup();
    tasks.set("child", {
      id: "child",
      parentId: "parent",
      background: true,
      status: "pending-model",
      updatedAt: new Date(),
    } as Task);
    const writeSubagentTranscript = vi.fn(async () => {});
    manager.initialize({
      blobStore: {} as never,
      adaptor: {
        getRequestGetters: () => ({ getLLM: () => ({ id: "test" }) as never }),
        executeToolCall: vi.fn(),
        writeSubagentTranscript,
      },
    });
    const { executor } = manager as unknown as {
      executor: {
        options: {
          createChatKit: (options: Record<string, unknown>) => Promise<unknown>;
        };
      };
    };
    try {
      const kit = (await executor.options.createChatKit({
        taskId: "child",
        store: (manager as unknown as { store: unknown }).store,
        blobStore: {},
        abortSignal: new AbortController().signal,
        taskState: { parentTaskId: "parent" },
        getters: { getLLM: () => ({ id: "test" }) },
        appendMessage: vi.fn(),
      })) as {
        transcriptWriter: {
          write: (data: { messages: Message[]; status: string }) => Promise<void>;
        };
      };
      await kit.transcriptWriter.write({
        messages: [
          {
            id: "user",
            role: "user",
            parts: [{ type: "text", text: "Find the title generator" }],
          } as Message,
        ],
        status: "pending-tool",
      });
      expect(writeSubagentTranscript).toHaveBeenCalledWith(
        expect.objectContaining({
          parentTaskId: "parent",
          taskId: "child",
          status: "pending-tool",
          transcript: expect.stringContaining("Find the title generator"),
        }),
      );
    } finally {
      await manager.dispose();
    }
  });

  it("routes job cancellation through ownership checks and delegates other tools", async () => {
    const { manager, observers, source } = setup();
    const executeToolCall = vi.fn(async () => ({ output: "platform result" }));
    manager.initialize({
      blobStore: {} as never,
      adaptor: {
        getRequestGetters: () => ({ getLLM: () => ({ id: "test" }) as never }),
        executeToolCall,
      },
    });
    const { executor } = manager as unknown as {
      executor: { options: { adaptor: RunningTaskAdaptor } };
    };
    const call = {
      taskId: "parent",
      storeId: "test",
      toolName: "killBackgroundJob",
      toolCallId: "stop-command",
      input: { backgroundJobId: "bgjob-cmd-one" },
      abortSignal: new AbortController().signal,
      allowBackground: false,
      toolPolicies: undefined,
    };
    try {
      await manager.watchTask("parent");
      observers.get("parent")!({
        running: { "bgjob-cmd-one": running("parent") },
        notifications: [],
      });
      await expect(executor.options.adaptor.executeToolCall(call)).resolves.toEqual({
        success: true,
      });
      await expect(
        executor.options.adaptor.executeToolCall({
          ...call,
          taskId: "fork",
        }),
      ).rejects.toThrow("not found");
      expect(source.kill).toHaveBeenCalledExactlyOnceWith("bgjob-cmd-one");
      expect(executeToolCall).not.toHaveBeenCalled();

      const command = {
        ...call,
        toolName: "executeCommand",
        input: { command: "echo test" },
      };
      await expect(
        executor.options.adaptor.executeToolCall(command),
      ).resolves.toEqual({ output: "platform result" });
      expect(executeToolCall).toHaveBeenCalledExactlyOnceWith(command);
    } finally {
      await manager.dispose();
    }
  });

  it("refuses to kill user-opened terminals", async () => {
    const { manager, source } = setup();
    await expect(manager.kill("term-abc", "parent")).rejects.toThrow(
      "user-opened terminal",
    );
    expect(source.kill).not.toHaveBeenCalled();
    await manager.dispose();
  });

  it("shares one manager across main, subagent and fork handles", () => {
    const { store, manager } = setup();
    expect(BackgroundJobManager.forStore(store)).toBe(manager);
  });

  it("keeps task handles usable after the chat reconnects", async () => {
    const { store, manager, source, observers } = setup();
    const handle = manager.forTask("parent");
    await manager.dispose();
    const reopened = BackgroundJobManager.forStore(store);
    reopened.connect(source);
    await reopened.watchTask("parent");
    observers.get("parent")!({
      running: { "bgjob-cmd-one": running("parent") },
      notifications: [],
    });
    await handle.kill("bgjob-cmd-one");
    expect(source.kill).toHaveBeenCalledExactlyOnceWith("bgjob-cmd-one");
    await expect(manager.forTask("fork").kill("bgjob-cmd-one")).rejects.toThrow(
      "not found",
    );
    await reopened.dispose();
  });

  it("uses process ownership even when a fork copied its parent's tool messages", async () => {
    const { manager, observers, messages, source, tasks } = setup();
    tasks.set("parent", { id: "parent", status: "pending-tool" } as Task);
    messages.set("fork", [
      {
        id: "copied",
        role: "assistant",
        parts: [
          {
            type: "tool-executeCommand",
            toolCallId: "old",
            state: "output-available",
            input: { command: "test" },
            output: { _meta: { backgroundJobId: "bgjob-cmd-one" } },
          },
        ],
      },
    ] as Message[]);
    await manager.watchTask("parent");
    await manager.watchTask("fork");
    const snapshot = {
      running: { "bgjob-cmd-one": running("parent") },
      notifications: [],
    };
    observers.get("parent")!(snapshot);
    observers.get("fork")!(snapshot);
    expect(manager.hasPending("parent")).toBe(true);
    expect(manager.hasPending("fork")).toBe(false);
    expect(manager.getJobsForTask("fork")).toEqual([]);
    await expect(manager.kill("bgjob-cmd-one", "fork")).rejects.toThrow(
      "not found",
    );
    expect(source.kill).not.toHaveBeenCalled();
    await manager.dispose();
    expect(source.kill).toHaveBeenCalledExactlyOnceWith("bgjob-cmd-one");
  });

  it("waits through the exit-to-notification gap and acknowledges after persisted delivery", async () => {
    const { manager, observers, acknowledge, setMessages } = setup();
    await manager.watchTask("parent");
    observers.get("parent")!({
      running: { "bgjob-cmd-one": running("parent") },
      notifications: [],
    });
    let done = false;
    const wait = manager.wait("parent").then(() => {
      done = true;
    });
    observers.get("parent")!({ running: {}, notifications: [] });
    await Promise.resolve();
    expect(done).toBe(false);
    observers.get("parent")!({ running: {}, notifications: [finished()] });
    await wait;
    expect(manager.getPendingNotifications("parent")).toEqual([finished()]);
    expect(manager.getPendingNotifications("parent")).toEqual([finished()]);
    expect(acknowledge).not.toHaveBeenCalled();
    setMessages("parent", [
      {
        id: "notice",
        role: "user",
        parts: [{ type: "data-background-job-notification", data: finished() }],
      },
    ]);
    expect(acknowledge).toHaveBeenCalledWith(finished().notificationId);
    await manager.dispose();
  });

  it("does not restore acknowledged commands or monitors from retained messages", async () => {
    const { manager, store, source, observers, setMessages, messages, pending } =
      setup();
    const monitor = {
      ...monitored(),
      ended: {
        status: "completed" as const,
        exitCode: 0,
        reason: "process exited",
      },
    };
    const notifications = [finished(), monitor];
    const history: Message[] = [
      {
        id: "start-monitor",
        role: "assistant",
        parts: [
          {
            type: "tool-startMonitor",
            toolCallId: "start-monitor",
            state: "output-available",
            input: { command: monitor.command, description: monitor.description },
            output: {
              backgroundJobId: monitor.backgroundJobId,
              outputFile: monitor.outputFile,
            },
          },
        ],
      },
      {
        id: "results",
        role: "user",
        parts: toBackgroundJobNotificationParts(notifications),
      },
    ];
    try {
      await manager.watchTask("parent");
      observers.get("parent")!({ running: {}, notifications });
      setMessages("parent", history);
      expect(pending.get("parent")).toEqual([]);
      expect(manager.getPendingNotifications("parent")).toEqual([]);
      expect(manager.getJobsForTask("parent")).toEqual(
        notifications.map((notice) =>
          expect.objectContaining({
            backgroundJobId: notice.backgroundJobId,
            status: "completed",
            notificationPending: false,
          }),
        ),
      );
    } finally {
      await manager.dispose();
    }

    const reopened = BackgroundJobManager.forStore(store);
    reopened.connect(source);
    try {
      await reopened.watchTask("parent");
      expect(reopened.getJobsForTask("parent")).toEqual([]);
      expect(reopened.getPendingNotifications("parent")).toEqual([]);
      expect(messages.get("parent")).toEqual(history);
    } finally {
      await reopened.dispose();
    }
  });

  it("removes delivered results from the native queue before reopening", async () => {
    const { manager, store, source, observers, setMessages, acknowledge } =
      setup();
    await manager.watchTask("parent");
    observers.get("parent")!({ running: {}, notifications: [finished()] });
    expect(manager.getPendingNotifications("parent")).toHaveLength(1);
    setMessages("parent", [
      {
        id: "notice",
        role: "user",
        parts: [{ type: "data-background-job-notification", data: finished() }],
      },
    ]);
    setMessages("parent", []);
    expect(acknowledge).toHaveBeenCalledWith(finished().notificationId);
    await manager.dispose();
    const reopened = BackgroundJobManager.forStore(store);
    reopened.connect(source);
    await reopened.watchTask("parent");
    expect(reopened.getPendingNotifications("parent")).toEqual([]);
    await reopened.dispose();
  });

  it("keeps a command the owner stopped itself out of its notification queue", async () => {
    const { manager, observers, acknowledge, source } = setup();
    await manager.watchTask("parent");
    observers.get("parent")!({
      running: { "bgjob-cmd-one": running("parent") },
      notifications: [],
    });
    await manager.kill("bgjob-cmd-one", "parent", { notify: false });
    expect(source.kill).toHaveBeenCalledExactlyOnceWith("bgjob-cmd-one");
    observers.get("parent")!({ running: {}, notifications: [stopped()] });
    expect(manager.getPendingNotifications("parent")).toEqual([]);
    // Acknowledged right away, so a reopen cannot revive it either.
    expect(acknowledge).toHaveBeenCalledWith(stopped().notificationId);
    expect(manager.getJobsForTask("parent")).toEqual([
      expect.objectContaining({
        status: "stopped",
        notificationPending: false,
      }),
    ]);
    await manager.dispose();
  });

  it("notifies the owner about a command stopped outside its own tool call", async () => {
    const { manager, observers, acknowledge } = setup();
    await manager.watchTask("parent");
    observers.get("parent")!({
      running: { "bgjob-cmd-one": running("parent") },
      notifications: [],
    });
    await manager.forTask("parent").kill("bgjob-cmd-one");
    observers.get("parent")!({ running: {}, notifications: [stopped()] });
    expect(manager.getPendingNotifications("parent")).toEqual([stopped()]);
    expect(acknowledge).not.toHaveBeenCalled();
    await manager.dispose();
  });

  it.each([finished(), stopped()])(
    "removes an already queued $status command notification before reopening",
    async (notice) => {
      const { manager, observers, acknowledge, source, store } = setup();
      const other = finished("bgjob-cmd-other");
      await manager.watchTask("parent");
      observers.get("parent")!({ running: {}, notifications: [notice, other] });
      const acknowledgeNow = acknowledge.getMockImplementation()!;
      let release!: () => void;
      const persisted = new Promise<void>((resolve) => {
        release = resolve;
      });
      acknowledge.mockImplementationOnce(async (id) => {
        await persisted;
        await acknowledgeNow(id);
      });
      let settled = false;
      const kill = manager
        .kill(notice.backgroundJobId, "parent", { notify: false })
        .then(() => {
          settled = true;
        });
      try {
        await vi.waitFor(() =>
          expect(acknowledge).toHaveBeenCalledWith(notice.notificationId),
        );
        expect(settled).toBe(false);
        expect(manager.getPendingNotifications("parent")).toEqual([other]);
      } finally {
        release();
        await kill;
        await manager.dispose();
      }
      const reopened = BackgroundJobManager.forStore(store);
      reopened.connect(source);
      try {
        await reopened.watchTask("parent");
        expect(reopened.getPendingNotifications("parent")).toEqual([other]);
      } finally {
        await reopened.dispose();
      }
    },
  );

  it("does not reconstruct a command from old tool messages when its process is gone", async () => {
    const { manager, messages, source } = setup();
    messages.set("parent", [
      {
        id: "old-command",
        role: "assistant",
        parts: [
          {
            type: "tool-executeCommand",
            toolCallId: "old",
            state: "output-available",
            input: { command: "test" },
            output: { _meta: { backgroundJobId: "bgjob-cmd-one" } },
          },
        ],
      },
    ] as Message[]);
    await manager.watchTask("parent");
    expect(manager.hasPending("parent")).toBe(false);
    expect(manager.getPendingNotifications("parent")).toEqual([]);
    expect(manager.getJobsForTask("parent")).toEqual([]);
    expect(source.kill).not.toHaveBeenCalled();
    await manager.dispose();
  });

  it("restores live commands without depending on preserved chat history", async () => {
    const { manager, source } = setup();
    source.observeCommands.mockImplementationOnce(async (update) => {
      update({ "bgjob-cmd-one": running("parent") });
      return { dispose: vi.fn(), acknowledge: vi.fn(async () => {}) };
    });
    await manager.watchTask("parent");
    expect(manager.hasPending("parent")).toBe(true);
    await manager.dispose();
  });

  it("stops a restored monitor whose process is gone and releases the wait", async () => {
    const { manager, source } = setup();
    source.observeNotifications.mockImplementationOnce(
      async (_taskId, update) => {
        update([monitored()]);
        return { dispose: vi.fn(), acknowledge: vi.fn(async () => {}) };
      },
    );
    await manager.watchTask("parent");
    expect(manager.getJobsForTask("parent")).toEqual([
      expect.objectContaining({
        backgroundJobId: "bgjob-monitor-one",
        status: "stopped",
      }),
    ]);
    expect(manager.hasPending("parent")).toBe(false);
    expect(await manager.wait("parent")).toBe("completed");
    // Preserve undelivered output.
    expect(manager.getPendingNotifications("parent")).toEqual([monitored()]);
    await manager.dispose();
  });

  it("keeps a restored monitor that still owns a live process", async () => {
    const { manager, source } = setup();
    source.observeNotifications.mockImplementationOnce(
      async (_taskId, update) => {
        update([monitored()]);
        return { dispose: vi.fn(), acknowledge: vi.fn(async () => {}) };
      },
    );
    source.observeCommands.mockImplementationOnce(async (update) => {
      update({
        "bgjob-monitor-one": { ...running("parent"), monitor: "watch" },
      });
      return { dispose: vi.fn(), acknowledge: vi.fn(async () => {}) };
    });
    await manager.watchTask("parent");
    expect(manager.getJobsForTask("parent")).toEqual([
      expect.objectContaining({
        backgroundJobId: "bgjob-monitor-one",
        status: "running",
      }),
    ]);
    expect(manager.hasPending("parent")).toBe(true);
    await manager.dispose();
  });

  it.each([
    ["completed", 0],
    ["failed", 7],
    ["stopped", 130],
  ] as const)(
    "replaces an inferred stop with a real %s result without reviving it",
    async (status, exitCode) => {
      const { manager, pending, observers } = setup();
      const notice = monitored();
      pending.set("parent", [notice]);
      try {
        await manager.watchTask("parent");
        expect(manager.getJobsForTask("parent")[0].status).toBe("stopped");
        observers.get("parent")!({
          running: {},
          notifications: [
            {
              ...notice,
              notificationId: "monitor:end",
              ended: { status, exitCode, reason: "process exited" },
            },
          ],
        });
        expect(manager.getJobsForTask("parent")[0]).toMatchObject({
          status,
          exitCode,
        });

        // Stale updates cannot overwrite a real result.
        observers.get("parent")!({
          running: {
            [notice.backgroundJobId]: {
              ...running("parent"),
              monitor: "watch",
            },
          },
          notifications: [notice],
        });
        expect(manager.getJobsForTask("parent")[0]).toMatchObject({
          status,
          exitCode,
        });
        expect(manager.hasPending("parent")).toBe(false);
      } finally {
        await manager.dispose();
      }
    },
  );

  it("resumes an inferred stop when a live process snapshot arrives later", async () => {
    const { manager, pending, observers } = setup();
    const notice = monitored();
    pending.set("parent", [notice]);
    try {
      await manager.watchTask("parent");
      expect(manager.hasPending("parent")).toBe(false);
      observers.get("parent")!({ running: {}, notifications: [notice] });
      observers.get("parent")!({
        running: {
          [notice.backgroundJobId]: { ...running("parent"), monitor: "watch" },
        },
        notifications: [notice],
      });
      expect(manager.getJobsForTask("parent")[0]).toMatchObject({
        status: "running",
        monitor: "watch",
      });
      expect(manager.hasPending("parent")).toBe(true);
    } finally {
      await manager.dispose();
    }
  });

  it("keeps an inferred stop when only old monitor output is replayed", async () => {
    const { manager, pending, observers } = setup();
    const notice = monitored();
    pending.set("parent", [notice]);
    try {
      await manager.watchTask("parent");
      observers.get("parent")!({ running: {}, notifications: [notice] });
      expect(manager.getJobsForTask("parent")[0].status).toBe("stopped");
      expect(manager.hasPending("parent")).toBe(false);
      expect(manager.getPendingNotifications("parent")).toEqual([notice]);
    } finally {
      await manager.dispose();
    }
  });

  it("honors abort without consuming a notification", async () => {
    const { manager, observers } = setup();
    await manager.watchTask("parent");
    observers.get("parent")!({
      running: { "bgjob-cmd-one": running("parent") },
      notifications: [],
    });
    expect(manager.hasPending("parent")).toBe(true);
    const controller = new AbortController();
    const wait = manager.wait("parent", { abortSignal: controller.signal });
    controller.abort();
    expect(await wait).toBe("aborted");
    observers.get("parent")!({ running: {}, notifications: [finished()] });
    expect(manager.getPendingNotifications("parent")).toEqual([finished()]);
    await manager.dispose();
  });

  it("stops a child and its command without stopping its siblings", async () => {
    const { manager, observers, tasks, source } = setup();
    tasks.set("child", {
      id: "child",
      parentId: "parent",
      background: true,
      status: "pending-model",
    } as Task);
    manager.registerTask("child", { parentTaskId: "parent" });
    await manager.watchTask("parent");
    await manager.watchTask("child");
    const snapshot = {
      running: {
        "bgjob-cmd-one": running("parent"),
        "bgjob-cmd-two": running("child"),
      },
      notifications: [],
    };
    observers.get("parent")!(snapshot);
    observers.get("child")!(snapshot);
    await manager.kill("bgjob-task-child", "parent");
    expect(source.kill).toHaveBeenCalledExactlyOnceWith("bgjob-cmd-two");
    expect(tasks.get("child")).toMatchObject({
      status: "failed",
      error: { kind: "AbortError" },
    });
    expect(
      manager
        .getJobsForTask("parent")
        .find((job) => job.kind === "subagent" && job.taskId === "child"),
    ).toMatchObject({ status: "stopped" });
    await manager.dispose();
  });

  it("uses the persisted agent status for its result", async () => {
    const { manager, tasks } = setup();
    tasks.set("child", {
      id: "child",
      parentId: "parent",
      background: true,
      status: "pending-model",
    } as Task);
    manager.registerTask("child", { parentTaskId: "parent" });
    await manager.watchTask("parent");
    expect(manager.getPendingNotifications("parent")).toEqual([]);
    expect(manager.hasPending("parent")).toBe(true);
    tasks.set("child", { ...tasks.get("child"), status: "completed" } as Task);
    expect(manager.getPendingNotifications("parent")).toEqual([
      expect.objectContaining({ kind: "subagent", status: "completed" }),
    ]);
    await manager.dispose();
  });

  it("appends the adaptor's finish note to the subagent result", async () => {
    const { manager, tasks } = setup();
    manager.initialize({
      blobStore: {} as never,
      adaptor: {
        getRequestGetters: () => ({ getLLM: () => ({ id: "test" }) as never }),
        executeToolCall: vi.fn(),
        onTaskFinished: async (taskId) =>
          taskId === "child" ? "Worktree note." : undefined,
      },
    });
    const { executor } = manager as unknown as {
      executor: { options: { adaptor: RunningTaskAdaptor } };
    };
    tasks.set("child", {
      id: "child",
      parentId: "parent",
      background: true,
      status: "completed",
    } as Task);
    manager.registerTask("child", { parentTaskId: "parent" });
    try {
      await manager.watchTask("parent");
      await executor.options.adaptor.onTaskFinished?.("child");
      expect(manager.getPendingNotifications("parent")).toEqual([
        expect.objectContaining({
          kind: "subagent",
          result: "Subagent finished without an explicit result.\n\nWorktree note.",
        }),
      ]);
    } finally {
      await manager.dispose();
    }
  });

  it("titles a command with its description while running and after it finishes", async () => {
    const { manager, observers } = setup();
    await manager.watchTask("parent");
    observers.get("parent")!({
      running: {
        "bgjob-cmd-one": {
          ...running("parent"),
          command: "cd /repo && bun run test",
          description: "Run unit tests",
        },
      },
      notifications: [],
    });
    expect(manager.getJobsForTask("parent")).toEqual([
      expect.objectContaining({
        title: "Run unit tests",
        command: "cd /repo && bun run test",
        description: "Run unit tests",
      }),
    ]);

    observers.get("parent")!({
      running: {},
      notifications: [
        createBackgroundJobNotification({
          taskId: "parent",
          backgroundJobId: "bgjob-cmd-one",
          command: "cd /repo && bun run test",
          description: "Run unit tests",
          outputFile: "/tmp/output",
          status: "completed",
          finishedAt: 1,
        }),
      ],
    });
    expect(manager.getJobsForTask("parent")).toEqual([
      expect.objectContaining({
        status: "completed",
        title: "Run unit tests",
        command: "cd /repo && bun run test",
      }),
    ]);
    await manager.dispose();
  });

  it("titles a command without a description with its command", async () => {
    const { manager, observers } = setup();
    await manager.watchTask("parent");
    observers.get("parent")!({ running: {}, notifications: [finished()] });
    expect(manager.getJobsForTask("parent")).toEqual([
      expect.objectContaining({ title: "test", command: "test" }),
    ]);
    await manager.dispose();
  });

  it("drops the use case prefix from a fork's title and keeps its start time", async () => {
    const { manager, tasks } = setup();
    tasks.set("fork", {
      id: "fork",
      status: "completed",
      background: true,
      title: "[Auto Memory Extraction] Review PR feedback",
      createdAt: new Date(1_700_000_000_000),
    } as Task);
    manager.registerTask("fork", {
      parentTaskId: "parent",
      useCase: "auto-memory",
    });
    await manager.watchTask("parent");
    expect(manager.getJobsForTask("parent")[0]).toMatchObject({
      kind: "fork",
      title: "Review PR feedback",
      createdAt: 1_700_000_000_000,
    });
    await manager.dispose();
  });

  it("keeps fork results out of the parent's notification queue", async () => {
    const { manager, tasks } = setup();
    tasks.set("fork", {
      id: "fork",
      status: "completed",
      background: true,
    } as Task);
    manager.registerTask("fork", {
      parentTaskId: "parent",
      useCase: "task-memory",
    });
    await manager.watchTask("parent");
    expect(manager.getPendingNotifications("parent")).toEqual([]);
    expect(manager.getJobsForTask("parent")[0]).toMatchObject({
      kind: "fork",
      status: "completed",
    });
    await manager.dispose();
  });

  it("uses persisted task results and messages after reopening without extra state", async () => {
    const { manager, tasks, store, setMessages, commit } = setup();
    tasks.set("child", {
      id: "child",
      parentId: "parent",
      background: true,
      status: "completed",
    } as Task);
    manager.registerTask("child", { parentTaskId: "parent" });
    const [notice] = manager.getPendingNotifications("parent");
    expect(notice).toMatchObject({ kind: "subagent", status: "completed" });
    setMessages("parent", [
      {
        id: "delivered",
        role: "user",
        parts: toBackgroundJobNotificationParts([notice]),
      },
    ]);
    await manager.dispose();
    const reopened = BackgroundJobManager.forStore(store);
    reopened.registerTask("child", { parentTaskId: "parent" });
    expect(reopened.getJobsForTask("parent")).toEqual([
      expect.objectContaining({
        kind: "subagent",
        status: "completed",
        notificationPending: false,
      }),
    ]);
    expect(reopened.getPendingNotifications("parent")).toEqual([]);
    expect(commit).not.toHaveBeenCalled();
    await reopened.dispose();
  });
});

it("shares one command subscription across tasks and releases it with the manager", async () => {
  const { manager, source } = setup();
  await Promise.all([
    manager.watchTask("parent"),
    manager.watchTask("child"),
    manager.watchTask("sibling"),
  ]);
  expect(source.observeCommands).toHaveBeenCalledOnce();
  expect(source.observeNotifications).toHaveBeenCalledTimes(3);
  const connection = await source.observeCommands.mock.results[0].value;
  await manager.dispose();
  expect(connection.dispose).toHaveBeenCalledOnce();
});

it("batches a snapshot and only delivers to the affected task", async () => {
  const { manager, observers } = setup();
  await manager.watchTask("parent");
  await manager.watchTask("sibling");
  const parent = vi.fn();
  const sibling = vi.fn();
  manager.subscribeNotifications("parent", parent);
  manager.subscribeNotifications("sibling", sibling);
  await vi.waitFor(() => expect(sibling).toHaveBeenCalled());
  parent.mockClear();
  sibling.mockClear();
  const changed = vi.fn();
  manager.subscribe(changed);
  const snapshot = {
    running: {},
    notifications: [finished(), finished("bgjob-cmd-two")],
  };
  observers.get("parent")!(snapshot);
  expect(parent).toHaveBeenCalledOnce();
  expect(parent).toHaveBeenCalledWith(snapshot.notifications, false);
  expect(sibling).not.toHaveBeenCalled();
  expect(changed).toHaveBeenCalledOnce();
  // Replaying an identical native snapshot makes no extra work.
  observers.get("parent")!(snapshot);
  expect(changed).toHaveBeenCalledOnce();
  await manager.dispose();
});

it("does not revive a completed command when an older live snapshot arrives", async () => {
  const { manager, observers } = setup();
  await manager.watchTask("parent");
  observers.get("parent")!({ running: {}, notifications: [finished()] });
  observers.get("parent")!({
    running: { "bgjob-cmd-one": running("parent") },
    notifications: [finished()],
  });
  expect(manager.hasPending("parent")).toBe(false);
  expect(manager.getPendingNotifications("parent")).toEqual([finished()]);
  await manager.dispose();
});

describe("sendMessage", () => {
  const completedChild = (overrides: Partial<Task> = {}) =>
    ({
      id: "child",
      parentId: "parent",
      background: true,
      status: "completed",
      title: "Audit the API docs",
      ...overrides,
    }) as Task;
  const childMessages = (): Message[] => [
    { id: "u1", role: "user", parts: [{ type: "text", text: "Audit the docs." }] },
    {
      id: "a1",
      role: "assistant",
      parts: [
        {
          type: "tool-attemptCompletion",
          toolCallId: "done-1",
          state: "input-available",
          input: { result: "Found 3 broken links." },
        },
      ],
    } as Message,
  ];
  const deliver = (
    setMessages: (taskId: string, value: Message[]) => void,
    notices: BackgroundJobNotification[],
  ) =>
    setMessages("parent", [
      {
        id: "p1",
        role: "user",
        parts: toBackgroundJobNotificationParts(notices),
      } as Message,
    ]);
  const readState = (manager: BackgroundJobManager, taskId: string) =>
    (
      manager as unknown as {
        taskStateStore: { read: (id: string) => unknown };
      }
    ).taskStateStore.read(taskId);

  it("only accepts this task's own background subagents", async () => {
    const { manager, tasks } = setup();
    tasks.set("other", completedChild({ id: "other", parentId: "elsewhere" }));
    tasks.set("fg", completedChild({ id: "fg", background: false }));
    const send = (id: string, message = "Check the links too.") =>
      manager.sendMessage(id, "parent", { message });
    try {
      await expect(send("bgjob-cmd-one")).rejects.toThrow(
        /not a background subagent/,
      );
      await expect(send("missing")).rejects.toThrow(/not found/);
      await expect(send("other")).rejects.toThrow(/not found/);
      await expect(send("fg")).rejects.toThrow(/not found/);
      tasks.set("child", completedChild());
      await expect(send("child", "  ")).rejects.toThrow(/empty/);
    } finally {
      await manager.dispose();
    }
  });

  it("refuses fork agents", async () => {
    const { manager, tasks } = setup();
    tasks.set("fork", completedChild({ id: "fork" }));
    manager.registerTask("fork", {
      parentTaskId: "parent",
      useCase: "task-memory",
    });
    try {
      await expect(
        manager.sendMessage("fork", "parent", {
          message: "Keep going.",
        }),
      ).rejects.toThrow(/fork agent/);
    } finally {
      await manager.dispose();
    }
  });

  it("resumes a finished subagent and announces each follow-up result separately", async () => {
    const { manager, tasks, messages, commit, setMessages } = setup();
    tasks.set("child", completedChild());
    messages.set("child", childMessages());
    manager.registerTask("child", { parentTaskId: "parent" });
    try {
      await manager.watchTask("parent");
      const [first] = manager.getPendingNotifications("parent");
      expect(first).toMatchObject({
        notificationId: "bgjob-task-child:terminal:completed",
        result: "Found 3 broken links.",
      });
      expect(first).not.toHaveProperty("followUp");
      deliver(setMessages, [first!]);
      const announced: BackgroundJobNotification[] = [];
      manager.subscribeNotifications("parent", (notices) =>
        announced.push(...notices),
      );
      await Promise.resolve();

      await expect(
        manager.sendMessage("child", "parent", {
          message: "Also check the images.",
        }),
      ).resolves.toEqual({
        success: true,
        status: "resumed",
        taskId: "child",
      });
      expect(commit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "v1.ChatStreamStarted",
          args: expect.objectContaining({
            id: "child",
            data: expect.objectContaining({
              role: "user",
              parts: [{ type: "text", text: "Also check the images." }],
            }),
          }),
        }),
      );
      expect(tasks.get("child")?.status).toBe("pending-model");
      expect(readState(manager, "child")).toMatchObject({ followUpCount: 1 });
      // Nothing to announce while the subagent works on the follow-up, not
      // even for a moment before the message is committed.
      expect(manager.getPendingNotifications("parent")).toEqual([]);
      expect(announced).toEqual([]);

      messages.set("child", [
        ...(messages.get("child") ?? []),
        {
          id: "a2",
          role: "assistant",
          parts: [
            {
              type: "tool-attemptCompletion",
              toolCallId: "done-2",
              state: "input-available",
              input: { result: "2 images are missing alt text." },
            },
          ],
        } as Message,
      ]);
      tasks.set("child", completedChild());
      const [second] = manager.getPendingNotifications("parent");
      expect(second).toMatchObject({
        notificationId: "bgjob-task-child:terminal:completed:followup-1",
        followUp: 1,
        result: "2 images are missing alt text.",
      });
    } finally {
      await manager.dispose();
    }
  });

  it("keeps the original notification id for a subagent that never got a follow-up", async () => {
    const { manager, tasks, messages } = setup();
    tasks.set("child", completedChild());
    // Reminders are user messages too, but not follow-ups.
    messages.set("child", [
      ...childMessages().slice(0, 1),
      {
        id: "r1",
        role: "user",
        parts: [{ type: "text", text: "<system-reminder>Use tools</system-reminder>" }],
      },
      ...childMessages().slice(1),
    ]);
    manager.registerTask("child", { parentTaskId: "parent" });
    try {
      await manager.watchTask("parent");
      expect(manager.getPendingNotifications("parent")).toMatchObject([
        { notificationId: "bgjob-task-child:terminal:completed" },
      ]);
    } finally {
      await manager.dispose();
    }
  });

  it("restores the follow-up count after a reload", async () => {
    const { manager, tasks, messages } = setup();
    tasks.set("child", completedChild());
    messages.set("child", childMessages());
    manager.registerTask("child", { parentTaskId: "parent", followUpCount: 2 });
    try {
      await manager.watchTask("parent");
      expect(manager.getPendingNotifications("parent")).toMatchObject([
        {
          notificationId: "bgjob-task-child:terminal:completed:followup-2",
          followUp: 2,
        },
      ]);
    } finally {
      await manager.dispose();
    }
  });

  it("resumes a subagent the parent stopped and announces its new result", async () => {
    const { manager, tasks, messages } = setup();
    tasks.set(
      "child",
      completedChild({
        status: "failed",
        error: { kind: "AbortError", message: "Stopped by user." },
      } as Partial<Task>),
    );
    messages.set("child", childMessages().slice(0, 1));
    manager.registerTask("child", {
      parentTaskId: "parent",
      stoppedByParent: true,
    });
    try {
      await manager.watchTask("parent");
      expect(manager.getPendingNotifications("parent")).toEqual([]);
      const announced: BackgroundJobNotification[] = [];
      manager.subscribeNotifications("parent", (notices) =>
        announced.push(...notices),
      );
      await Promise.resolve();
      // Jobs keep changing while the message is on its way.
      const internals = manager as unknown as {
        executor?: { sendMessage: () => Promise<undefined> };
      };
      // biome-ignore lint/suspicious/noExplicitAny: test seam
      (internals as any).executor = {
        dispose: async () => {},
        isTaskRunning: () => false,
        isTaskQueued: () => false,
        sendMessage: async () => {
          manager.taskChanged("child");
          return undefined;
        },
      };
      await expect(
        manager.sendMessage("child", "parent", {
          message: "Resume, but only check the README.",
        }),
      ).resolves.toMatchObject({ status: "resumed", taskId: "child" });
      internals.executor = undefined;
      expect(announced).toEqual([]);
      expect(readState(manager, "child")).toMatchObject({
        stoppedByParent: false,
        followUpCount: 1,
      });
      tasks.set("child", completedChild());
      expect(manager.getPendingNotifications("parent")).toMatchObject([
        { notificationId: "bgjob-task-child:terminal:completed:followup-1" },
      ]);
    } finally {
      await manager.dispose();
    }
  });

  it("reports a subagent waiting for an execution slot as queued", async () => {
    const { manager, tasks, messages } = setup();
    tasks.set("child", completedChild({ status: "pending-model" }));
    messages.set("child", childMessages().slice(0, 1));
    manager.registerTask("child", { parentTaskId: "parent" });
    try {
      await expect(
        manager.sendMessage("child", "parent", {
          message: "Start with the README.",
          interrupt: true,
        }),
      ).resolves.toMatchObject({ status: "queued", taskId: "child" });
      expect(messages.get("child")?.at(-1)).toMatchObject({
        role: "user",
        parts: [{ type: "text", text: "Start with the README." }],
      });
    } finally {
      await manager.dispose();
    }
  });

  it("hands the message to a running subagent, and resumes it once its loop has ended", async () => {
    const { store, tasks, messages } = makeJobStore();
    const manager = BackgroundJobManager.forStore(store);
    manager.initialize({
      blobStore: {} as never,
      adaptor: {
        getRequestGetters: () => ({ getLLM: () => ({ id: "test" }) as never }),
        executeToolCall: vi.fn(),
      },
    });
    tasks.set("child", completedChild({ status: "pending-model" }));
    messages.set("child", childMessages().slice(0, 1));
    manager.registerTask("child", { parentTaskId: "parent" });
    const { executor } = manager as unknown as {
      executor: {
        sendMessage: (
          taskId: string,
          message: string,
          options?: { interrupt?: boolean },
        ) => Promise<"queued" | "interrupted" | undefined>;
      };
    };
    const send = vi
      .spyOn(executor, "sendMessage")
      .mockResolvedValueOnce("queued")
      .mockResolvedValueOnce("interrupted")
      .mockResolvedValueOnce(undefined);
    try {
      await expect(
        manager.sendMessage("child", "parent", {
          message: "Also check the images.",
        }),
      ).resolves.toMatchObject({ status: "queued", taskId: "child" });
      await expect(
        manager.sendMessage("bgjob-task-child", "parent", {
          message: "Stop, check the README first.",
          interrupt: true,
        }),
      ).resolves.toMatchObject({ status: "interrupted", taskId: "child" });
      expect(send).toHaveBeenNthCalledWith(
        1,
        "child",
        "Also check the images.",
        { interrupt: false },
      );
      expect(send).toHaveBeenNthCalledWith(
        2,
        "child",
        "Stop, check the README first.",
        { interrupt: true },
      );

      // The loop ended between the status check and the message.
      tasks.set("child", completedChild());
      await expect(
        manager.sendMessage("child", "parent", {
          message: "One more thing.",
        }),
      ).resolves.toMatchObject({ status: "resumed", taskId: "child" });
      expect(messages.get("child")?.at(-1)).toMatchObject({
        role: "user",
        parts: [{ type: "text", text: "One more thing." }],
      });
      expect(readState(manager, "child")).toMatchObject({ followUpCount: 3 });
    } finally {
      await manager.dispose();
    }
  });
});
