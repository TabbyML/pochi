import assert from "assert";
import { TaskStore } from "../task-store";
import * as vscode from "vscode";
import sinon from "sinon";
import "reflect-metadata";

describe("TaskStore", () => {
  let context: vscode.ExtensionContext;
  let globalState: any;
  let taskStore: TaskStore;
  let clock: sinon.SinonFakeTimers;

  beforeEach(() => {
    globalState = {
      get: sinon.stub(),
      update: sinon.stub(),
    };
    context = {
      globalState,
      extensionMode: vscode.ExtensionMode.Production,
      subscriptions: [],
      workspaceState: {} as any,
      secrets: {} as any,
      extensionUri: {} as any,
      extensionPath: "",
      environmentVariableCollection: {} as any,
      asAbsolutePath: (p: string) => p,
      storageUri: {} as any,
      globalStorageUri: {} as any,
      logUri: {} as any,
      storagePath: "",
      globalStoragePath: "",
    } as unknown as vscode.ExtensionContext;

    clock = sinon.useFakeTimers(new Date("2024-01-01T00:00:00Z").getTime());
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
  });

  it("should filter out stale tasks older than 3 months", () => {
    const now = Date.now();
    const fourMonthsAgo = now - 120 * 24 * 60 * 60 * 1000;
    const twoMonthsAgo = now - 60 * 24 * 60 * 60 * 1000;

    const tasks = {
      "task-1": { id: "task-1", updatedAt: fourMonthsAgo },
      "task-2": { id: "task-2", updatedAt: twoMonthsAgo },
    };

    globalState.get.returns(tasks);

    taskStore = new TaskStore(context);

    // Verify only recent task remains
    const currentTasks = taskStore.tasks.value;
    assert.strictEqual(Object.keys(currentTasks).length, 1);
    assert.ok(currentTasks["task-2"]);
    assert.strictEqual(currentTasks["task-1"], undefined);

    // Verify globalState was updated
    sinon.assert.calledWith(globalState.update, "tasks", sinon.match({
      "task-2": sinon.match.any
    }));
  });

  it("should keep all tasks if none are stale", () => {
    const now = Date.now();
    const oneMonthAgo = now - 30 * 24 * 60 * 60 * 1000;
    const twoMonthsAgo = now - 60 * 24 * 60 * 60 * 1000;

    const tasks = {
      "task-1": { id: "task-1", updatedAt: oneMonthAgo },
      "task-2": { id: "task-2", updatedAt: twoMonthsAgo },
    };

    globalState.get.returns(tasks);

    taskStore = new TaskStore(context);

    const currentTasks = taskStore.tasks.value;
    assert.strictEqual(Object.keys(currentTasks).length, 2);
    assert.ok(currentTasks["task-1"]);
    assert.ok(currentTasks["task-2"]);

    // Verify globalState was NOT updated since no changes needed
    sinon.assert.notCalled(globalState.update);
  });
});