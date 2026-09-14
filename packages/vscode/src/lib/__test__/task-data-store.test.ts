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
    const event = {
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
      2,
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
      ["monitor:2", "monitor:3"],
    );
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
