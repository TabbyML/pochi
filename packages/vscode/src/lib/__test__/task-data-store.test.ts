import * as assert from "node:assert";
import type { BackgroundJobNotification, BackgroundMonitorNotification } from "@getpochi/common";
import { describe, it } from "mocha";
import type * as vscode from "vscode";
import { TaskDataStore } from "../task-data-store";

describe("TaskDataStore background job notifications", () => {
  it("stores command and monitor notifications together across reloads and acknowledgements", async () => {
    let persisted: Record<string, unknown> = {};
    const context = { globalState: {
      get: () => persisted,
      update: async (_key: string, value: Record<string, unknown>) => {
        await new Promise<void>((resolve) => setImmediate(resolve));
        persisted = value;
      },
    } } as unknown as vscode.ExtensionContext;
    const store = new TaskDataStore(context);
    const head = monitor("watch:0");
    const command = notification("command");
    await Promise.all([
      store.addBackgroundJobNotification("task", head),
      store.addBackgroundJobNotification("task", command),
      store.addBackgroundJobNotification("task", monitor("watch:1")),
    ]);
    assert.deepStrictEqual(persisted, { task: {
      updatedAt: store.state.value.task.updatedAt,
      backgroundJobNotifications: [head, command, { ...monitor("watch:1"), buffered: true }],
    } });
    const reloaded = new TaskDataStore(context);
    assert.deepStrictEqual(reloaded.getBackgroundJobNotificationsSignal("task").value, [head, command]);
    // Neither an unpublished buffer nor another task can acknowledge this head.
    await reloaded.acknowledgeBackgroundJobNotification("task", "watch:1");
    await reloaded.acknowledgeBackgroundJobNotification("sibling", head.notificationId);
    assert.deepStrictEqual(reloaded.getBackgroundJobNotificationsSignal("task").value, [head, command]);
    await reloaded.acknowledgeBackgroundJobNotification("task", command.notificationId);
    assert.deepStrictEqual(reloaded.getBackgroundJobNotificationsSignal("task").value, [head]);
    await reloaded.acknowledgeBackgroundJobNotification("task", head.notificationId);
    assert.deepStrictEqual(new TaskDataStore(context).getBackgroundJobNotificationsSignal("task").value, [monitor("watch:1")]);
  });

  it("retains concurrent monitor events across reload and acknowledges only delivered IDs", async () => {
    let persisted: Record<string, unknown> = {};
    const context = {
      globalState: {
        get: () => persisted,
        update: async (_key: string, value: Record<string, unknown>) => {
          await new Promise<void>((resolve) => setImmediate(resolve));
          persisted = value;
        },
      },
    } as unknown as vscode.ExtensionContext;
    const store = new TaskDataStore(context);
    const event = { kind: "monitor" as const,
      notificationId: "monitor:1",
      backgroundJobId: "bgjob-monitor-1",
      description: "watch",
      command: "watch",
      outputFile: "/tmp/watch.log",
      lines: ["first"],
    };
    await Promise.all([
      store.addBackgroundJobNotification("task-1", event),
      store.addBackgroundJobNotification("task-1", {
        ...event,
        notificationId: "monitor:2",
        lines: ["second"],
      }),
    ]);
    const reloaded = new TaskDataStore(context);
    assert.strictEqual(
      reloaded.getBackgroundJobNotificationsSignal("task-1").value.length,
      1,
    );
    assert.strictEqual(
      reloaded.getBackgroundJobNotificationsSignal("task-2").value.length,
      0,
    );
    await Promise.all([
      reloaded.acknowledgeBackgroundJobNotification("task-1", "monitor:1"),
      reloaded.addBackgroundJobNotification("task-1", {
        ...event,
        notificationId: "monitor:3",
      }),
    ]);
    const again = new TaskDataStore(context);
    assert.deepStrictEqual(
      again
        .getBackgroundJobNotificationsSignal("task-1")
        .value.map((item) => item.notificationId),
      ["monitor:2"],
    );
    await again.acknowledgeBackgroundJobNotification("task-1", "monitor:2");
    assert.deepStrictEqual(again.getBackgroundJobNotificationsSignal("task-1").value.map((item) => item.notificationId), ["monitor:3"]);
  });

  it("persists bounded monitor buffers and terminal state while the webview is absent", async () => {
    let persisted: Record<string, unknown> = {};
    const context = { globalState: {
      get: () => persisted,
      update: async (_key: string, value: Record<string, unknown>) => { persisted = value; },
    } } as unknown as vscode.ExtensionContext;
    const store = new TaskDataStore(context);
    const event = { kind: "monitor" as const,
      notificationId: "event-0", backgroundJobId: "bgjob-monitor-1", description: "CI",
      command: "watch", outputFile: "/tmp/watch.log", lines: ["line 0"],
    };
    await Promise.all(Array.from({ length: 200 }, (_, i) => store.addBackgroundJobNotification("task", {
      ...event, notificationId: `event-${i}`, lines: [`line ${i}`],
    })));
    assert.deepStrictEqual(store.getBackgroundJobNotificationsSignal("task").value, [event]);
    await store.addBackgroundJobNotification("task", {
      ...event, notificationId: "end", lines: [], ended: { reason: "done", status: "completed" },
    });
    const reloaded = new TaskDataStore(context);
    const visible = reloaded.getBackgroundJobNotificationsSignal("task").value.filter((notification) => notification.kind === "monitor");
    assert.strictEqual(visible.length, 2);
    assert.strictEqual(visible[1].lines.length, 50);
    assert.strictEqual(visible[1].omittedLines, 149);
    assert.strictEqual(visible[1].lines.at(-1), "line 199");
    assert.strictEqual(visible[1].ended?.status, "completed");
    await Promise.all(visible.map((item) => reloaded.acknowledgeBackgroundJobNotification("task", item.notificationId)));
    assert.deepStrictEqual(new TaskDataStore(context).getBackgroundJobNotificationsSignal("task").value, []);
  });

  it("does not lose notifications that finish concurrently", async () => {
    let persisted: Record<string, unknown> = {};
    const context = {
      globalState: {
        get: (_key: string, defaultValue: unknown) => persisted || defaultValue,
        update: async (_key: string, value: Record<string, unknown>) => {
          await new Promise<void>((resolve) => setImmediate(resolve));
          persisted = value;
        },
      },
    } as unknown as vscode.ExtensionContext;
    const store = new TaskDataStore(context);

    await Promise.all([
      store.addBackgroundJobNotification("task-1", notification("job-1")),
      store.addBackgroundJobNotification("task-1", notification("job-2")),
    ]);

    assert.deepStrictEqual(
      store
        .getBackgroundJobNotificationsSignal("task-1")
        .value.map((item) => item.backgroundJobId),
      ["job-1", "job-2"],
    );
  });
});

function notification(backgroundJobId: string): BackgroundJobNotification {
  return {
    kind: "command",
    notificationId: `${backgroundJobId}:terminal`,
    backgroundJobId,
    outputFile: `/tmp/${backgroundJobId}.log`,
    command: `run ${backgroundJobId}`,
    status: "completed",
    summary: `${backgroundJobId} completed`,
    exitCode: 0,
    finishedAt: 1,
  };
}

function monitor(notificationId: string): BackgroundMonitorNotification {
  return {
    kind: "monitor", notificationId, backgroundJobId: "watch", description: "CI",
    command: "watch", outputFile: "/tmp/watch.log", lines: [notificationId],
  };
}
