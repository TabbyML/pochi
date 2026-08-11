import * as assert from "node:assert";
import type { BackgroundJobNotification } from "@getpochi/common";
import { describe, it } from "mocha";
import type * as vscode from "vscode";
import { TaskDataStore } from "../task-data-store";

describe("TaskDataStore background job notifications", () => {
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
