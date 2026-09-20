import { toBackgroundJobNotificationParts } from "../chat/background-job-notification";
import type { BackgroundJobEvent } from "@getpochi/common";
import type { BackgroundCommands } from "@getpochi/common/vscode-webui-bridge";
import { createBackgroundJobNotification } from "@getpochi/common";
import { describe, expect, it, vi } from "vitest";
import type { RunningTaskAdaptor } from "../background-task/task-executor/task-executor";
import type { Message, Task } from "../types";
import { makeJobStore } from "./__tests__/test-store";
import { BackgroundJobManager, type BackgroundCommandAdaptor } from "./manager";

function setup() {
  const data = makeJobStore();
  const pending = new Map<string, readonly BackgroundJobEvent[]>();
  const notificationObservers = new Map<
    string,
    (notifications: readonly BackgroundJobEvent[]) => void
  >();
  const observers = new Map<
    string,
    (snapshot: {
      running: BackgroundCommands;
      notifications: BackgroundJobEvent[];
    }) => void
  >();
  let commandsChanged: Parameters<
    BackgroundCommandAdaptor["observeCommands"]
  >[0];
  const source = {
    kill: vi.fn(async () => {}),
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
const monitored = (id = "bgjob-monitor-one") => ({
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

describe("BackgroundJobManager", () => {
  it("waits for cooldown expiry even after the last monitor exits", async () => {
    vi.useFakeTimers();
    const { manager, observers } = setup();
    try {
      await manager.watchTask("parent");
      const ended = {
        notificationId: "monitor:end", backgroundJobId: "bgjob-monitor-watch",
        description: "watch", command: "watch", outputFile: "/tmp/watch.log",
        lines: ["last output"], ended: { reason: "done", status: "completed" as const },
      };
      manager.takeReadyNotifications("parent", [{ ...ended, notificationId: "previous", ended: undefined }]);
      observers.get("parent")!({ running: {}, notifications: [ended] });
      expect(manager.hasPending("parent")).toBe(false);
      const settled = vi.fn();
      const waiting = manager.wait("parent", { wakeOnNotifications: true }).then(settled);
      await vi.advanceTimersByTimeAsync(5999);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await waiting;
      expect(settled).toHaveBeenCalledExactlyOnceWith("notifications");
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
      parentTaskId: undefined,
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
    const { manager, observers, messages, source } = setup();
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
    await manager.dispose();
    expect(source.kill).not.toHaveBeenCalled();
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
    expect(await manager.wait("parent", { timeoutMs: 0 })).toBe("timeout");
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
      expect(await manager.wait("parent", { timeoutMs: 0 })).toBe("timeout");
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

  it("honors a zero timeout and abort without consuming a notification", async () => {
    const { manager, observers } = setup();
    await manager.watchTask("parent");
    observers.get("parent")!({
      running: { "bgjob-cmd-one": running("parent") },
      notifications: [],
    });
    expect(await manager.wait("parent", { timeoutMs: 0 })).toBe("timeout");
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
  expect(parent).toHaveBeenCalledWith(snapshot.notifications);
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
