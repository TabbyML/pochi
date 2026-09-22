import * as assert from "node:assert";
import type { BackgroundJobNotification } from "@getpochi/common";
import { describe, it } from "mocha";
import type * as vscode from "vscode";
import { TaskDataStore } from "../task-data-store";

describe("TaskDataStore background job notifications", () => {
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
      store.addMonitorEvent("task-1", event),
      store.addMonitorEvent("task-1", {
        ...event,
        notificationId: "monitor:2",
        lines: ["second"],
      }),
    ]);
    const reloaded = new TaskDataStore(context);
    assert.strictEqual(
      reloaded.getMonitorEventsSignal("task-1").value.length,
      1,
    );
    assert.strictEqual(
      reloaded.getMonitorEventsSignal("task-2").value.length,
      0,
    );
    await Promise.all([
      reloaded.acknowledgeMonitorEvent("task-1", "monitor:1"),
      reloaded.addMonitorEvent("task-1", {
        ...event,
        notificationId: "monitor:3",
      }),
    ]);
    const again = new TaskDataStore(context);
    assert.deepStrictEqual(
      again
        .getMonitorEventsSignal("task-1")
        .value.map((item) => item.notificationId),
      ["monitor:2"],
    );
    await again.acknowledgeMonitorEvent("task-1", "monitor:2");
    assert.deepStrictEqual(again.getMonitorEventsSignal("task-1").value.map((item) => item.notificationId), ["monitor:3"]);
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
    await Promise.all(Array.from({ length: 200 }, (_, i) => store.addMonitorEvent("task", {
      ...event, notificationId: `event-${i}`, lines: [`line ${i}`],
    })));
    assert.deepStrictEqual(store.getMonitorEventsSignal("task").value, [event]);
    await store.addMonitorEvent("task", {
      ...event, notificationId: "end", lines: [], ended: { reason: "done", status: "completed" },
    });
    const reloaded = new TaskDataStore(context);
    const visible = reloaded.getMonitorEventsSignal("task").value;
    assert.strictEqual(visible.length, 2);
    assert.strictEqual(visible[1].lines.length, 50);
    assert.strictEqual(visible[1].omittedLines, 149);
    assert.strictEqual(visible[1].lines.at(-1), "line 199");
    assert.strictEqual(visible[1].ended?.status, "completed");
    await Promise.all(visible.map((item) => reloaded.acknowledgeMonitorEvent("task", item.notificationId)));
    assert.deepStrictEqual(new TaskDataStore(context).getMonitorEventsSignal("task").value, []);
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
