import type { BackgroundJobNotification, MonitorEventEnvelope } from "@getpochi/common";
import type {
  BackgroundCommands,
  ExecuteCommandResult,
} from "@getpochi/common/vscode-webui-bridge";
import { serializeThreadSignalWithSnapshot } from "@getpochi/common/vscode-webui-bridge/thread-signal";
import { BackgroundJobManager, type Message } from "@getpochi/livekit";
import { makeJobStore } from "@getpochi/livekit/testing";
import { signal } from "@preact/signals-core";
import { ThreadSignal } from "@quilted/threads/signals";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { vscodeHost } from "./vscode";

import { VscodeRunningTaskAdaptor } from "./vscode-running-task-adaptor";

vi.mock("./vscode", () => ({
  vscodeHost: {
    readBackgroundCommands: vi.fn(),
    readBackgroundJobNotifications: vi.fn(),
    readMonitorEvents: vi.fn(),
    executeToolCall: vi.fn(),
    readModelList: vi.fn(),
    readMcpStatus: vi.fn(),
    readCustomAgents: vi.fn(),
    readSkills: vi.fn(),
    readEffectiveContextWindow: vi.fn(),
  },
}));

function makeStore(initialMessages: Message[] = []) {
  const data = makeJobStore();
  data.setMessages("child", initialMessages);
  const manager = BackgroundJobManager.forStore(data.store);
  const adaptor = new VscodeRunningTaskAdaptor();
  manager.connect(adaptor.commandAdaptor);
  return {
    manager,
    store: data.store,
    setMessages: (messages: Message[]) => data.setMessages("child", messages),
    dispose: async () => {
      adaptor.dispose();
      await manager.dispose();
    },
  };
}
async function createCommands(store: ReturnType<typeof makeStore>) {
  const commands = await taskCommands(store.manager, "child");
  return {
    ...commands,
    dispose: () => {
      void store.dispose();
    },
  };
}

async function taskCommands(manager: BackgroundJobManager, taskId: string) {
  await manager.watchTask(taskId);
  return {
    hasPendingJobs: () => manager.hasPending(taskId),
    pendingNotifications: () => manager.getPendingNotifications(taskId),
    waitForPending: async (abortSignal: AbortSignal) => {
      await manager.wait(taskId, { abortSignal });
      abortSignal.throwIfAborted();
    },
  };
}

function notification(id: string): BackgroundJobNotification {
  return {
    kind: "command",
    backgroundJobId: id,
    notificationId: `${id}:terminal`,
    status: "completed",
    summary: "done",
    outputFile: "/tmp/output",
    finishedAt: 1,
  };
}

function deliveredMessage(data: BackgroundJobNotification): Message {
  return {
    id: "notification",
    role: "user",
    parts: [{ type: "data-background-job-notification", data }],
  };
}

describe("VS Code background command ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(vscodeHost.readMonitorEvents).mockImplementation(async () => ({
      events: serializeThreadSignalWithSnapshot(signal([])), acknowledge: vi.fn(),
    }));
  });

  it("passes fork background restrictions to the host", async () => {
    vi.mocked(vscodeHost.executeToolCall).mockResolvedValue({ output: "done" });
    const adaptor = new VscodeRunningTaskAdaptor();
    try {
      await adaptor.executeToolCall({
        toolName: "executeCommand",
        toolCallId: "fork-command",
        input: { command: "echo test" },
        taskId: "fork",
        parentTaskId: "parent",
        storeId: "store",
        allowBackground: false,
        abortSignal: new AbortController().signal,
        toolPolicies: undefined,
      });
      expect(vscodeHost.executeToolCall).toHaveBeenCalledWith(
        "executeCommand",
        { command: "echo test" },
        expect.objectContaining({ taskId: "fork", allowBackground: false }),
      );
    } finally {
      await adaptor.waitUntilReady();
      adaptor.dispose();
    }
  });

  function setup() {
    const running = signal<BackgroundCommands>({});
    const notifications = signal<BackgroundJobNotification[]>([]);
    const monitorEvents = signal<MonitorEventEnvelope[]>([]);
    const acknowledgeMonitor = vi.fn(async (id: string) => {
      monitorEvents.value = monitorEvents.value.filter((event) => event.notificationId !== id);
    });
    vi.mocked(vscodeHost.readMonitorEvents).mockImplementation(async (taskId) => ({
      events: serializeThreadSignalWithSnapshot(taskId === "child" ? monitorEvents : signal<MonitorEventEnvelope[]>([])),
      acknowledge: acknowledgeMonitor,
    }));
    const close = vi.fn(async () => {});
    const acknowledge = vi.fn(async () => {});
    vi.mocked(vscodeHost.readBackgroundCommands).mockImplementation(
      async () => ({
        backgroundCommands: serializeThreadSignalWithSnapshot(running),
        close,
        show: vi.fn(),
        hide: vi.fn(),
      }),
    );
    vi.mocked(vscodeHost.readBackgroundJobNotifications).mockImplementation(
      async (taskId) => ({
        notifications: serializeThreadSignalWithSnapshot(
          taskId === "child"
            ? notifications
            : signal<BackgroundJobNotification[]>([]),
        ),
        acknowledge,
      }),
    );
    return { running, notifications, close, acknowledge, monitorEvents, acknowledgeMonitor };
  }

  it("delivers monitor batches through the manager and acknowledges their own queue", async () => {
    const { running, monitorEvents, acknowledgeMonitor, acknowledge, close } = setup();
    const store = makeStore();
    const event: MonitorEventEnvelope = {
      notificationId: "monitor-event", backgroundJobId: "bgjob-monitor-one", description: "CI", command: "watch CI", outputFile: "/tmp/monitor.log", lines: ["check passed"],
    };
    running.value = { [event.backgroundJobId]: { taskId: "child", command: event.command, monitor: event.description, outputFile: event.outputFile, isVisible: false } };
    await store.manager.watchTask("child");
    try {
      const waiting = store.manager.wait("child", { wakeOnNotifications: true, timeoutMs: 1000 });
      monitorEvents.value = [event];
      expect(await waiting).toBe("notifications");
      expect(store.manager.getPendingNotifications("child")).toEqual([event]);
      expect(store.manager.getJobsForTask("child")[0]).toMatchObject({ monitor: "CI", command: "watch CI", status: "running" });
      expect(acknowledgeMonitor).not.toHaveBeenCalled();
      store.setMessages([{ id: "delivered", role: "user", parts: [{ type: "data-monitor-events", data: { batches: [event] } }] }]);
      await expect.poll(() => acknowledgeMonitor.mock.calls).toEqual([[event.notificationId]]);
      expect(acknowledge).not.toHaveBeenCalled();
      expect(store.manager.getPendingNotifications("child")).toEqual([]);
      await store.manager.kill(event.backgroundJobId, "child");
      expect(close).toHaveBeenCalledExactlyOnceWith(event.backgroundJobId);
    } finally {
      await store.dispose();
    }
  });

  it("waits through the exit-to-notification gap and acknowledges only persisted delivery", async () => {
    const { running, notifications, acknowledge } = setup();
    const store = makeStore();
    const commands = await createCommands(store);
    try {
      running.value = {
        mine: {
          isVisible: false,
          taskId: "child",
          command: "test",
          outputFile: "/tmp/output",
        },
        sibling: {
          isVisible: false,
          taskId: "sibling",
          command: "test",
          outputFile: "/tmp/output",
        },
      };
      let done = false;
      const wait = commands
        .waitForPending(new AbortController().signal)
        .then(() => {
          done = true;
        });
      running.value = {
        sibling: {
          isVisible: false,
          taskId: "sibling",
          command: "test",
          outputFile: "/tmp/output",
        },
      };
      await Promise.resolve();
      expect(done).toBe(false);
      const result = notification("mine");
      notifications.value = [result];
      await wait;
      expect(commands.pendingNotifications()).toEqual([result]);
      expect(commands.pendingNotifications()).toEqual([result]);
      expect(commands.hasPendingJobs()).toBe(false);
      expect(acknowledge).not.toHaveBeenCalled();
      store.setMessages([deliveredMessage(result)]);
      expect(acknowledge).toHaveBeenCalledWith(result.notificationId);
      expect(vscodeHost.readBackgroundJobNotifications).toHaveBeenCalledWith(
        "child",
      );
    } finally {
      commands.dispose();
    }
  });

  it("disconnects without cancelling commands when the Webview closes", async () => {
    const { running, notifications, close, acknowledge } = setup();
    const store = makeStore();
    const commands = await createCommands(store);
    running.value = {
      mine: {
        isVisible: false,
        taskId: "child",
        command: "test",
        outputFile: "/tmp/output",
      },
      sibling: {
        isVisible: false,
        taskId: "sibling",
        command: "test",
        outputFile: "/tmp/output",
      },
    };
    const wait = commands.waitForPending(new AbortController().signal);
    commands.dispose();
    await wait;
    commands.dispose();
    expect(close).not.toHaveBeenCalled();
    const result = notification("mine");
    notifications.value = [result];
    store.setMessages([deliveredMessage(result)]);
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it("deduplicates persisted notifications when the executor is recreated", async () => {
    const { notifications, acknowledge } = setup();
    const result = notification("mine");
    notifications.value = [result];
    const store = makeStore([deliveredMessage(result)]);
    const commands = await createCommands(store);
    try {
      expect(commands.pendingNotifications()).toEqual([]);
      expect(commands.hasPendingJobs()).toBe(false);
      expect(acknowledge).toHaveBeenCalledExactlyOnceWith(
        result.notificationId,
      );
    } finally {
      commands.dispose();
    }
  });

  it("restores ownership from native process metadata", async () => {
    const { running, notifications } = setup();
    running.value = {
      mine: {
        isVisible: false,
        taskId: "child",
        command: "test",
        outputFile: "/tmp/output",
      },
    };
    const store = makeStore([
      {
        id: "tool",
        role: "assistant",
        parts: [
          {
            type: "tool-executeCommand",
            toolCallId: "call",
            state: "output-available",
            input: { command: "test" },
            output: { output: "started", _meta: { backgroundJobId: "mine" } },
          },
        ],
      },
    ]);
    const commands = await createCommands(store);
    try {
      expect(commands.hasPendingJobs()).toBe(true);
      notifications.value = [notification("mine")];
      await commands.waitForPending(new AbortController().signal);
      expect(commands.pendingNotifications()).toEqual([notification("mine")]);
    } finally {
      commands.dispose();
    }
  });

  it("aborts a wait without consuming the completion notification", async () => {
    const { notifications, running } = setup();
    const commands = await createCommands(makeStore());
    try {
      running.value = { mine: { isVisible: false, taskId: "child" } };
      const controller = new AbortController();
      const wait = commands.waitForPending(controller.signal);
      const rejected = expect(wait).rejects.toMatchObject({
        name: "AbortError",
      });
      controller.abort();
      await rejected;
      notifications.value = [notification("mine")];
      expect(commands.pendingNotifications()).toEqual([notification("mine")]);
    } finally {
      commands.dispose();
    }
  });

  it("tracks a foreground command promoted by the VS Code streaming response", async () => {
    const { running, notifications } = setup();
    vi.mocked(vscodeHost.readModelList).mockResolvedValue({
      modelList: ThreadSignal.serialize(signal([])),
      isLoading: ThreadSignal.serialize(signal(false)),
      reload: vi.fn(async () => {}),
    });
    vi.mocked(vscodeHost.readMcpStatus).mockResolvedValue(
      ThreadSignal.serialize(
        signal({ connections: {}, toolset: {}, instructions: "" }),
      ),
    );
    vi.mocked(vscodeHost.readCustomAgents).mockResolvedValue(
      ThreadSignal.serialize(signal([])),
    );
    vi.mocked(vscodeHost.readSkills).mockResolvedValue(
      ThreadSignal.serialize(signal([])),
    );
    vi.mocked(vscodeHost.readEffectiveContextWindow).mockResolvedValue(
      ThreadSignal.serialize(signal(undefined)),
    );
    const adaptor = new VscodeRunningTaskAdaptor();
    try {
      await adaptor.waitUntilReady();
      const store = makeJobStore();
      const manager = BackgroundJobManager.forStore(store.store);
      manager.connect(adaptor.commandAdaptor);
      const commands = await taskCommands(manager, "child");
      const sibling = await taskCommands(manager, "sibling");
      expect(vscodeHost.readBackgroundCommands).toHaveBeenCalledOnce();
      const output = signal<ExecuteCommandResult>({
        status: "running",
        content: "partial",
        isTruncated: false,
      });
      vi.mocked(vscodeHost.executeToolCall).mockResolvedValue({
        streamingOutput: ThreadSignal.serialize(output),
      });
      const execution = adaptor.executeToolCall({
        toolName: "executeCommand",
        toolCallId: "call",
        input: { command: "test" },
        storeId: "store",
        taskId: "child",
        parentTaskId: "parent",
        abortSignal: new AbortController().signal,
        toolPolicies: undefined,
      });
      // Allow the adaptor to subscribe to the running foreground output.
      await Promise.resolve();
      running.value = {
        mine: {
          isVisible: false,
          taskId: "child",
          command: "test",
          outputFile: "/tmp/output",
        },
      };
      output.value = {
        status: "completed",
        content: "Moved to background",
        isTruncated: false,
        _meta: { backgroundJobId: "mine" },
      };
      expect(await execution).toMatchObject({
        _meta: { backgroundJobId: "mine" },
      });
      expect(commands.hasPendingJobs()).toBe(true);
      expect(sibling.hasPendingJobs()).toBe(false);
      const wait = commands.waitForPending(new AbortController().signal);
      notifications.value = [notification("mine")];
      await wait;
      expect(commands.pendingNotifications()).toEqual([notification("mine")]);
      expect(sibling.pendingNotifications()).toEqual([]);
    } finally {
      adaptor.dispose();
    }
  });
});

describe("notifications changing during collector initialization", () => {
  it("waits for the remote subscription and its current snapshot before restoring commands", async () => {
    const notifications = signal<BackgroundJobNotification[]>([]);
    const serialized = serializeThreadSignalWithSnapshot(notifications);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const start = vi.fn(
      async (...args: Parameters<typeof serialized.start>) => {
        await gate;
        await serialized.start(...args);
      },
    );
    vi.mocked(vscodeHost.readBackgroundCommands).mockResolvedValue({
      backgroundCommands: serializeThreadSignalWithSnapshot(signal({})),
      close: vi.fn(async () => {}),
      show: vi.fn(),
      hide: vi.fn(),
    });
    vi.mocked(vscodeHost.readBackgroundJobNotifications).mockResolvedValue({
      notifications: { ...serialized, start },
      acknowledge: vi.fn(async () => {}),
    });
    let initialized = false;
    const creation = createCommands(makeStore()).then((commands) => {
      initialized = true;
      return commands;
    });
    await vi.waitFor(() => expect(start).toHaveBeenCalled());
    expect(initialized).toBe(false);
    const completed = notification("mine");
    notifications.value = [completed];
    release();
    const commands = await creation;
    try {
      expect(commands.pendingNotifications()).toEqual([completed]);
      expect(commands.hasPendingJobs()).toBe(false);
    } finally {
      commands.dispose();
    }
  });

  it("observes a command completion published while the commands RPC is pending", async () => {
    const notifications = signal<BackgroundJobNotification[]>([]);
    const running = signal<BackgroundCommands>({
      mine: {
        isVisible: false,
        taskId: "child",
        command: "test",
        outputFile: "/tmp/output",
      },
    });
    let releaseCommands!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseCommands = resolve;
    });
    const runningSnapshot = serializeThreadSignalWithSnapshot(running);
    vi.mocked(vscodeHost.readBackgroundCommands).mockImplementation(
      async () => {
        await gate;
        return {
          backgroundCommands: runningSnapshot,
          close: vi.fn(async () => {}),
          show: vi.fn(),
          hide: vi.fn(),
        };
      },
    );
    vi.mocked(vscodeHost.readBackgroundJobNotifications).mockResolvedValue({
      notifications: serializeThreadSignalWithSnapshot(notifications),
      acknowledge: vi.fn(async () => {}),
    });
    const store = makeStore([
      {
        id: "assistant",
        role: "assistant",
        parts: [
          {
            type: "tool-executeCommand",
            toolCallId: "call",
            state: "output-available",
            input: { command: "test" },
            output: { output: "started", _meta: { backgroundJobId: "mine" } },
          },
        ],
      },
    ]);
    const creation = createCommands(store);
    const finished = notification("mine");
    notifications.value = [finished];
    running.value = {};
    releaseCommands();
    const commands = await creation;
    try {
      expect(commands.pendingNotifications()).toEqual([finished]);
      expect(commands.hasPendingJobs()).toBe(false);
    } finally {
      commands.dispose();
    }
  });
});
