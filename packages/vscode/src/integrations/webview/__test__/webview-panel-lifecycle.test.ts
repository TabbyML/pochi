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
  const { PochiTaskEditorProvider, PochiTaskDocument } = proxyquire
    .noCallThru()
    .load("../webview-panel", {
      "./base": { WebviewBase: class {} },
      "./vscode-host-impl": {},
      "@getpochi/common/store-id-utils": {},
      "../layout": {},
      "../terminal/terminal-job": {
        TerminalJob: { list: () => jobs, onDidCreate: created.event },
      },
      "@/integrations/editor/pochi-file-system-provider": {},
      "@/lib/workspace-scoped": {},
      vscode: {
        ...vscode,
        window: {
          registerCustomEditorProvider: () => ({ dispose() {} }),
          tabGroups: { all: [{ tabs }], onDidChangeTabs: changes.event },
        },
      },
    }) as typeof import("../webview-panel");
  const registration = PochiTaskEditorProvider.register({} as never);
  function open(uid: string, viewType = PochiTaskEditorProvider.viewType) {
    const uri = vscode.Uri.from({
      scheme: "pochi-task",
      path: `/pochi/task/${uid}`,
      query: JSON.stringify({ uid, cwd: "/workspace" }),
    });
    const tab = {
      input: new vscode.TabInputCustom(uri, viewType),
    } as vscode.Tab;
    tabs.push(tab);
    return {
      tab,
      document: new PochiTaskDocument(uri),
      close() {
        tabs.splice(tabs.indexOf(tab), 1);
        changes.fire({ closed: [tab], opened: [], changed: [] });
      },
    };
  }
  function createJob(taskId: string, rootTaskId?: string) {
    const job = { taskId, rootTaskId, kill: () => stopped.push(taskId) };
    jobs.push(job);
    created.fire(job);
    return job;
  }
  return { open, createJob, changes, stopped, registration };
}

describe("task tab background job cleanup", () => {
  it("kills registered jobs throughout the task tree without needing WebUI cleanup", () => {
    const h = createHarness();
    try {
      const parent = h.open("parent");
      h.open("other");
      for (const id of ["parent", "child", "grandchild", "completed-child"])
        h.createJob(id, "parent");
      h.createJob("other", "other");
      h.createJob("unowned");
      parent.document.dispose();
      assert.deepStrictEqual(h.stopped, []);
      parent.close();
      assert.deepStrictEqual(h.stopped, [
        "parent",
        "child",
        "grandchild",
        "completed-child",
      ]);
    } finally {
      h.registration.dispose();
    }
  });

  it("ignores unrelated tabs and moving a task between groups", () => {
    const h = createHarness();
    try {
      const task = h.open("parent");
      h.createJob("parent", "parent");
      h.open("parent", "other.editor").close();
      h.changes.fire({ closed: [task.tab], opened: [task.tab], changed: [] });
      h.changes.fire({
        closed: [{ input: {} } as vscode.Tab],
        opened: [],
        changed: [],
      });
      assert.deepStrictEqual(h.stopped, []);
      task.close();
      assert.deepStrictEqual(h.stopped, ["parent"]);
    } finally {
      h.registration.dispose();
    }
  });

  it("kills late registrations from startup or foreground promotion after close", () => {
    const h = createHarness();
    try {
      h.open("parent").close();
      h.createJob("starting-child", "parent");
      h.createJob("promoted-command", "parent");
      assert.deepStrictEqual(h.stopped, ["starting-child", "promoted-command"]);
      h.open("parent");
      h.createJob("new-command", "parent");
      assert.deepStrictEqual(h.stopped, ["starting-child", "promoted-command"]);
    } finally {
      h.registration.dispose();
    }
  });
});
