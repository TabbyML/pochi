import * as assert from "node:assert";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";
import * as vscode from "vscode";

function createHarness() {
  const tabs: vscode.Tab[] = [];
  const changes = new vscode.EventEmitter<vscode.TabChangeEvent>();
  type Job = { taskId: string; rootTaskId?: string; kill(): void };
  const created = new vscode.EventEmitter<Job>();
  const jobs: Job[] = [];
  const stopped: string[] = [];
  const notifications = {
    taskUpdated: new vscode.EventEmitter<{ event: unknown }>(),
    taskRunning: new vscode.EventEmitter<{ taskId: string }>(),
    taskPendingApproval: new vscode.EventEmitter<{ taskId: string }>(),
  };
  const noopEvent = () => ({ dispose() {} });
  const { TaskActivityTracker } = proxyquire
    .noCallThru()
    .load("../task-activity-tracker", {
      tsyringe: { injectable: () => () => {}, singleton: () => () => {} },
      "@/lib/task-events": {
        taskUpdated: { event: notifications.taskUpdated.event },
        taskRunning: { event: notifications.taskRunning.event },
        taskPendingApproval: { event: notifications.taskPendingApproval.event },
      },
      "../terminal/terminal-job": {
        TerminalJob: { list: () => jobs, onDidCreate: created.event },
      },
      "../webview/webview-panel": {
        PochiTaskEditorProvider: {
          scheme: "pochi-task",
          parseTaskUri: (uri: vscode.Uri) => JSON.parse(uri.query),
        },
      },
      vscode: {
        ...vscode,
        window: {
          tabGroups: {
            all: [{ tabs }],
            onDidChangeTabs: changes.event,
            onDidChangeTabGroups: noopEvent,
          },
        },
      },
    }) as typeof import("../task-activity-tracker");
  const tracker = new TaskActivityTracker();
  function open(uid: string) {
    const uri = vscode.Uri.from({
      scheme: "pochi-task",
      path: `/pochi/task/${uid}`,
      query: JSON.stringify({ uid, cwd: "/workspace" }),
    });
    const tab = {
      input: new vscode.TabInputCustom(uri, "pochi.taskEditor"),
    } as vscode.Tab;
    tabs.push(tab);
    changes.fire({ closed: [], opened: [tab], changed: [] });
    return () => {
      tabs.splice(tabs.indexOf(tab), 1);
      changes.fire({ closed: [tab], opened: [], changed: [] });
    };
  }
  function createJob(taskId: string, rootTaskId?: string) {
    const job = { taskId, rootTaskId, kill: () => stopped.push(taskId) };
    jobs.push(job);
    created.fire(job);
  }
  return { open, createJob, stopped, tracker, notifications };
}

describe("TaskActivityTracker task cleanup", () => {
  it("kills jobs throughout the task tree when its tab closes", () => {
    const h = createHarness();
    try {
      const closeParent = h.open("parent");
      h.open("other");
      for (const id of ["parent", "child", "grandchild", "completed-child"])
        h.createJob(id, "parent");
      h.createJob("other", "other");
      h.createJob("unowned");
      const foregroundSignals = ["parent", "child", "grandchild"].map(() =>
        h.tracker.getTaskAbortSignal("parent"),
      );
      const otherSignal = h.tracker.getTaskAbortSignal("other");
      assert.deepStrictEqual(h.stopped, []);
      assert.ok(foregroundSignals.every((signal) => !signal.aborted));
      closeParent();
      assert.deepStrictEqual(h.stopped, [
        "parent",
        "child",
        "grandchild",
        "completed-child",
      ]);
      assert.ok(foregroundSignals.every((signal) => signal.aborted));
      assert.strictEqual(otherSignal.aborted, false);
    } finally {
      h.tracker.dispose();
    }
  });

  it("aborts late foreground calls and gives reopened tasks a fresh lifetime", () => {
    const h = createHarness();
    try {
      const close = h.open("parent");
      const previousSignal = h.tracker.getTaskAbortSignal("parent");
      close();
      assert.strictEqual(previousSignal.aborted, true);
      assert.strictEqual(h.tracker.getTaskAbortSignal("parent").aborted, true);

      h.open("parent");
      const nextSignal = h.tracker.getTaskAbortSignal("parent");
      assert.strictEqual(nextSignal.aborted, false);
      assert.notStrictEqual(nextSignal, previousSignal);
      assert.strictEqual(previousSignal.aborted, true);
    } finally {
      h.tracker.dispose();
    }
  });

  it("keeps foreground calls alive until the last tab for their task closes", () => {
    const h = createHarness();
    try {
      const closeFirst = h.open("parent");
      const signal = h.tracker.getTaskAbortSignal("parent");
      const closeSecond = h.open("parent");
      h.open("other");
      assert.strictEqual(signal.aborted, false);
      closeFirst();
      assert.strictEqual(signal.aborted, false);
      assert.strictEqual(h.tracker.getTaskAbortSignal("parent"), signal);
      closeSecond();
      assert.strictEqual(signal.aborted, true);
    } finally {
      h.tracker.dispose();
    }
  });

  it("aborts active foreground calls when the tracker is disposed", () => {
    const h = createHarness();
    h.open("parent");
    const signal = h.tracker.getTaskAbortSignal("parent");
    signal.addEventListener("abort", () => {
      assert.strictEqual(h.tracker.getTaskAbortSignal("parent").aborted, true);
    });
    h.tracker.dispose();
    assert.strictEqual(signal.aborted, true);
    assert.strictEqual(h.tracker.getTaskAbortSignal("parent").aborted, true);
  });

  for (const event of [
    "taskUpdated",
    "taskRunning",
    "taskPendingApproval",
  ] as const) {
    it(`rejects late tool calls and jobs after a ${event} notification`, () => {
      const h = createHarness();
      try {
        const close = h.open("parent");
        const previousSignal = h.tracker.getTaskAbortSignal("parent");
        close();
        h.notifications[event].fire({
          taskId: "parent",
          event: { id: "parent", cwd: "/workspace", status: "pending-tool" },
        });
        assert.ok(h.tracker.state.value.parent);
        assert.strictEqual(previousSignal.aborted, true);
        assert.strictEqual(
          h.tracker.getTaskAbortSignal("parent").aborted,
          true,
        );
        h.createJob("late-command", "parent");
        assert.deepStrictEqual(h.stopped, ["late-command"]);

        h.open("parent");
        const nextSignal = h.tracker.getTaskAbortSignal("parent");
        assert.strictEqual(nextSignal.aborted, false);
        assert.notStrictEqual(nextSignal, previousSignal);
        h.createJob("new-command", "parent");
        assert.deepStrictEqual(h.stopped, ["late-command"]);
      } finally {
        h.tracker.dispose();
      }
    });
  }

  it("kills late registrations from startup or foreground promotion after close", () => {
    const h = createHarness();
    try {
      h.open("parent")();
      h.createJob("starting-child", "parent");
      h.createJob("promoted-command", "parent");
      assert.deepStrictEqual(h.stopped, ["starting-child", "promoted-command"]);
      h.open("parent");
      h.createJob("new-command", "parent");
      assert.deepStrictEqual(h.stopped, ["starting-child", "promoted-command"]);
    } finally {
      h.tracker.dispose();
    }
  });
});
