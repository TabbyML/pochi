import assert from "assert";
import { TaskStore } from "../task-store";
import * as vscode from "vscode";
import sinon from "sinon";
import "reflect-metadata";
import { TextEncoder } from "util";

describe("TaskStore", () => {
  let context: vscode.ExtensionContext;
  let globalState: any;
  let taskStore: TaskStore;
  let clock: sinon.SinonFakeTimers;
  let tempStorageUri: vscode.Uri;

  beforeEach(async () => {
    // Create a temp directory for tests
    const tempDir = vscode.Uri.file(
      `/tmp/pochi-test-${Date.now()}-${Math.random()}`
    );
    tempStorageUri = tempDir;
    
    // Ensure it's empty (though unique path should ensure that)
    try {
        await vscode.workspace.fs.delete(tempDir, { recursive: true, useTrash: false });
    } catch {}
    await vscode.workspace.fs.createDirectory(tempDir);

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
      globalStorageUri: tempStorageUri,
      logUri: {} as any,
      storagePath: "",
      globalStoragePath: "",
    } as unknown as vscode.ExtensionContext;

    clock = sinon.useFakeTimers(new Date("2024-01-01T00:00:00Z").getTime());
  });

  afterEach(async () => {
    clock.restore();
    sinon.restore();
    try {
        await vscode.workspace.fs.delete(tempStorageUri, { recursive: true, useTrash: false });
    } catch {}
  });

  it("should start with empty tasks if file does not exist", async () => {
    taskStore = new TaskStore(context);
    await taskStore.ready;

    const currentTasks = taskStore.tasks.value;
    assert.strictEqual(Object.keys(currentTasks).length, 0);
    
    // Verify globalState was NOT accessed (migration removed)
    sinon.assert.notCalled(globalState.get);
  });

  it("should load from disk if file exists", async () => {
    const now = Date.now();
    const tasks = {
      "task-1": { id: "task-1", updatedAt: now },
    };
    
    const fileUri = vscode.Uri.joinPath(tempStorageUri, "tasks.json");
    await vscode.workspace.fs.writeFile(
        fileUri, 
        new TextEncoder().encode(JSON.stringify(tasks))
    );

    taskStore = new TaskStore(context);
    await taskStore.ready;

    const currentTasks = taskStore.tasks.value;
    assert.deepStrictEqual(currentTasks["task-1"], tasks["task-1"]);
    
    sinon.assert.notCalled(globalState.get);
  });

  it("should filter out stale tasks older than 3 months", async () => {
    const now = Date.now();
    const fourMonthsAgo = now - 120 * 24 * 60 * 60 * 1000;
    const twoMonthsAgo = now - 60 * 24 * 60 * 60 * 1000;

    const tasks = {
      "task-1": { id: "task-1", updatedAt: fourMonthsAgo },
      "task-2": { id: "task-2", updatedAt: twoMonthsAgo },
    };

    // Setup file with tasks
    const fileUri = vscode.Uri.joinPath(tempStorageUri, "tasks.json");
    await vscode.workspace.fs.writeFile(
        fileUri, 
        new TextEncoder().encode(JSON.stringify(tasks))
    );

    taskStore = new TaskStore(context);
    await taskStore.ready;

    // Verify only recent task remains
    const currentTasks = taskStore.tasks.value;
    assert.strictEqual(Object.keys(currentTasks).length, 1);
    assert.ok(currentTasks["task-2"]);
    assert.strictEqual(currentTasks["task-1"], undefined);

    // Verify file was updated
    const content = await vscode.workspace.fs.readFile(fileUri);
    const savedTasks = JSON.parse(content.toString());
    assert.strictEqual(Object.keys(savedTasks).length, 1);
    assert.ok(savedTasks["task-2"]);
  });
});