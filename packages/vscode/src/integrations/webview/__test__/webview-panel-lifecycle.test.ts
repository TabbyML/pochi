import * as assert from "node:assert";
import type { TaskStates } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";
import * as vscode from "vscode";

function createHarness() {
  const state = signal<TaskStates>({});
  type Job = { taskId: string; rootTaskId?: string; kill(): void };
  const created = new vscode.EventEmitter<Job>();
  const jobs: Job[] = [];
  const stopped: string[] = [];
  const { PochiTaskEditorProvider } = proxyquire
    .noCallThru()
    .load("../webview-panel", {
      "./base": { WebviewBase: class {} },
      "./vscode-host-impl": {},
      "@getpochi/common/store-id-utils": {},
      "../layout": {},
      "../editor/task-activity-tracker": { TaskActivityTracker: class {} },
      "../terminal/terminal-job": {
        TerminalJob: { list: () => jobs, onDidCreate: created.event },
      },
      "@/integrations/editor/pochi-file-system-provider": {},
      "@/lib/workspace-scoped": {},
      tsyringe: { container: { resolve: () => ({ state }) } },
      vscode: {
        ...vscode,
        window: { registerCustomEditorProvider: () => ({ dispose() {} }) },
      },
    }) as typeof import("../webview-panel");
  const registration = PochiTaskEditorProvider.register({} as never);
  function open(uid: string) {
    state.value = { ...state.value, [uid]: { cwd: "/workspace" } };
  }
  function close(uid: string) {
    const { [uid]: _, ...rest } = state.value;
    state.value = rest;
  }
  function createJob(taskId: string, rootTaskId?: string) {
    const job = { taskId, rootTaskId, kill: () => stopped.push(taskId) };
    jobs.push(job);
    created.fire(job);
    return job;
  }
  return { open, close, createJob, stopped, registration };
}

describe("task tab background job cleanup", () => {
  it("kills jobs throughout the task tree once the task is no longer open", () => {
    const h = createHarness();
    try {
      h.open("parent");
      h.open("other");
      for (const id of ["parent", "child", "grandchild", "completed-child"])
        h.createJob(id, "parent");
      h.createJob("other", "other");
      h.createJob("unowned");
      assert.deepStrictEqual(h.stopped, []);
      h.close("parent");
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

  it("kills late registrations from startup or foreground promotion after close", () => {
    const h = createHarness();
    try {
      h.open("parent");
      h.close("parent");
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
