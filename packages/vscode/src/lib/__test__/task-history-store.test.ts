import assert from "assert";
import { TaskHistoryStore } from "../task-history-store";
import { taskUpdated } from "../task-events";
import * as vscode from "vscode";
import sinon from "sinon";
import "reflect-metadata";
import { TextDecoder, TextEncoder } from "util";

describe("TaskHistoryStore", () => {
  let context: vscode.ExtensionContext;
  let globalState: any;
  let taskStore: TaskHistoryStore;
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
    // Listeners are registered on a module level emitter, so leaking a store
    // would make it observe events fired by later tests.
    taskStore?.dispose();
    clock.restore();
    sinon.restore();
    try {
        await vscode.workspace.fs.delete(tempStorageUri, { recursive: true, useTrash: false });
    } catch {}
  });

  it("should start with empty tasks if file does not exist", async () => {
    taskStore = new TaskHistoryStore(context);
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

    taskStore = new TaskHistoryStore(context);
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

    taskStore = new TaskHistoryStore(context);
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

  it("should filter out tasks older than 1 week when worktree is deleted", async () => {
    const now = Date.now();
    const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;
    const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;
    
    // Create a temp directory to simulate an existing worktree
    const existingWorktree = vscode.Uri.joinPath(tempStorageUri, "existing-worktree");
    await vscode.workspace.fs.createDirectory(existingWorktree);
    
    const nonExistingWorktree = `/tmp/non-existing-worktree-${Date.now()}`;

    const tasks = {
      "task-old-deleted-worktree": { 
        id: "task-old-deleted-worktree", 
        updatedAt: twoWeeksAgo,
        cwd: nonExistingWorktree 
      },
      "task-old-existing-worktree": { 
        id: "task-old-existing-worktree", 
        updatedAt: twoWeeksAgo,
        cwd: existingWorktree.fsPath 
      },
      "task-recent-deleted-worktree": { 
        id: "task-recent-deleted-worktree", 
        updatedAt: threeDaysAgo,
        cwd: nonExistingWorktree 
      },
      "task-old-no-cwd": { 
        id: "task-old-no-cwd", 
        updatedAt: twoWeeksAgo 
      },
    };

    // Setup file with tasks
    const fileUri = vscode.Uri.joinPath(tempStorageUri, "tasks.json");
    await vscode.workspace.fs.writeFile(
        fileUri, 
        new TextEncoder().encode(JSON.stringify(tasks))
    );

    taskStore = new TaskHistoryStore(context);
    await taskStore.ready;

    const currentTasks = taskStore.tasks.value;
    
    // Task with old timestamp and deleted worktree should be removed
    assert.strictEqual(currentTasks["task-old-deleted-worktree"], undefined);
    
    // Task with old timestamp but existing worktree should be kept
    assert.ok(currentTasks["task-old-existing-worktree"]);
    
    // Task with recent timestamp and deleted worktree should be kept
    assert.ok(currentTasks["task-recent-deleted-worktree"]);
    
    // Task with old timestamp but no cwd should be kept
    assert.ok(currentTasks["task-old-no-cwd"]);

    // Verify file was updated
    const content = await vscode.workspace.fs.readFile(fileUri);
    const savedTasks = JSON.parse(content.toString());
    assert.strictEqual(Object.keys(savedTasks).length, 3);
  });

  it("should back up an unparsable file instead of dropping it", async () => {
    const fileUri = vscode.Uri.joinPath(tempStorageUri, "tasks.json");
    await vscode.workspace.fs.writeFile(
      fileUri,
      new TextEncoder().encode('{"task-1": {"id": "task-1", "updatedAt": 1')
    );

    taskStore = new TaskHistoryStore(context);
    await taskStore.ready;

    assert.strictEqual(Object.keys(taskStore.tasks.value).length, 0);

    const entries = await vscode.workspace.fs.readDirectory(tempStorageUri);
    const backups = entries.filter(([name]) =>
      name.startsWith("tasks.corrupted-")
    );
    assert.strictEqual(backups.length, 1);

    // The original file is moved away, not left behind truncated.
    await assert.rejects(() => vscode.workspace.fs.stat(fileUri) as any);
  });

  it("should shrink oversized task errors before persisting", async () => {
    taskStore = new TaskHistoryStore(context);
    await taskStore.ready;

    const requestBodyValues = { prompt: "x".repeat(200_000) };
    taskUpdated.fire({
      event: {
        id: "task-huge",
        parentId: null,
        shareId: null,
        updatedAt: Date.now(),
        error: JSON.stringify({
          kind: "APICallError",
          isRetryable: false,
          message: "string too long",
          requestBodyValues,
        }),
      },
    });

    const stored = taskStore.tasks.value["task-huge"];
    assert.ok(stored.error);
    assert.ok(stored.error.length < 1024);
    const parsed = JSON.parse(stored.error);
    assert.strictEqual(parsed.kind, "APICallError");
    assert.strictEqual(parsed.isRetryable, false);
    assert.strictEqual(parsed.message, "string too long");
    assert.strictEqual(
      parsed.requestBodyValues.omitted,
      "requestBodyValues too large"
    );
  });

  it("should not overwrite tasks written by another window", async () => {
    const now = Date.now();
    const fileUri = vscode.Uri.joinPath(tempStorageUri, "tasks.json");
    await vscode.workspace.fs.writeFile(
      fileUri,
      new TextEncoder().encode(
        JSON.stringify({
          "task-shared": { id: "task-shared", updatedAt: now },
        })
      )
    );

    taskStore = new TaskHistoryStore(context);
    await taskStore.ready;

    // Another window appends its own task to the shared file.
    await vscode.workspace.fs.writeFile(
      fileUri,
      new TextEncoder().encode(
        JSON.stringify({
          "task-shared": { id: "task-shared", updatedAt: now },
          "task-other-window": { id: "task-other-window", updatedAt: now + 1 },
        })
      )
    );

    taskUpdated.fire({
      event: {
        id: "task-mine",
        parentId: null,
        shareId: null,
        updatedAt: now + 2,
      },
    });

    // Closing the window must flush synchronously, and keep the other
    // window's task.
    taskStore.dispose();

    const content = await vscode.workspace.fs.readFile(fileUri);
    const savedTasks = JSON.parse(new TextDecoder().decode(content));
    assert.deepStrictEqual(Object.keys(savedTasks).sort(), [
      "task-mine",
      "task-other-window",
      "task-shared",
    ]);

    // No temp file is left behind.
    const entries = await vscode.workspace.fs.readDirectory(tempStorageUri);
    assert.strictEqual(
      entries.filter(([name]) => name.includes(".tmp.json")).length,
      0
    );
  });
});