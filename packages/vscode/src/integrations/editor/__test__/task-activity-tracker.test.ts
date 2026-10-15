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
  const noopEvent = () => ({ dispose() {} });
  const { TaskActivityTracker } = proxyquire
    .noCallThru()
    .load("../task-activity-tracker", {
      tsyringe: { injectable: () => () => {}, singleton: () => () => {} },
      "@/lib/task-events": {
        taskUpdated: { event: noopEvent },
        taskRunning: { event: noopEvent },
        taskPendingApproval: { event: noopEvent },
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
  return { open, createJob, stopped, tracker };
}

describe("TaskActivityTracker background job cleanup", () => {
  it("kills jobs throughout the task tree when its tab closes", () => {
    const h = createHarness();
    try {
      const closeParent = h.open("parent");
      h.open("other");
      for (const id of ["parent", "child", "grandchild", "completed-child"])
        h.createJob(id, "parent");
      h.createJob("other", "other");
      h.createJob("unowned");
      assert.deepStrictEqual(h.stopped, []);
      closeParent();
      assert.deepStrictEqual(h.stopped, [
        "parent",
        "child",
        "grandchild",
        "completed-child",
      ]);
    } finally {
      h.tracker.dispose();
    }
  });

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
