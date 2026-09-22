import assert from "assert";
import fs from "node:fs";
import fsAsync from "node:fs/promises";
import { TaskHistoryStore } from "../task-history-store";
import { taskUpdated } from "../task-events";
import * as vscode from "vscode";
import sinon from "sinon";
import proxyquire from "proxyquire";
import "reflect-metadata";
import { TextDecoder, TextEncoder } from "util";

describe("TaskHistoryStore", () => {
  let context: vscode.ExtensionContext;
  let Store: typeof TaskHistoryStore;
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

    Store = proxyquire.noCallThru().load("../task-history-store", {
      "@getpochi/common/tool-utils": {
        getTaskDataDir: (id: string) => vscode.Uri.joinPath(tempStorageUri, "task-data", id).fsPath,
      },
      "@getpochi/common/auto-memory/node": { removeTaskTranscripts: async () => {} },
    }).TaskHistoryStore;

    clock = sinon.useFakeTimers(new Date("2024-01-01T00:00:00Z").getTime());
  });

  afterEach(async () => {
    // Listeners are registered on a module level emitter, so leaking a store
    // would make it observe events fired by later tests.
    taskStore?.dispose();
    await (taskStore as any)?.writeQueue;
    clock.restore();
    sinon.restore();
    try {
        await vscode.workspace.fs.delete(tempStorageUri, { recursive: true, useTrash: false });
    } catch {}
  });

  it("should start with empty tasks if file does not exist", async () => {
    taskStore = new Store(context);
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

    taskStore = new Store(context);
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

    taskStore = new Store(context);
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

    taskStore = new Store(context);
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

    taskStore = new Store(context);
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
    taskStore = new Store(context);
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

    taskStore = new Store(context);
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

  for (const synchronous of [false, true]) {
    it(`should preserve the previous history when ${synchronous ? "the final" : "an asynchronous"} rename fails`, async () => {
      const fileUri = vscode.Uri.joinPath(tempStorageUri, "tasks.json");
      const original = {
        "task-existing": { id: "task-existing", updatedAt: Date.now() },
      };
      await fsAsync.writeFile(fileUri.fsPath, JSON.stringify(original));
      taskStore = new Store(context);
      await taskStore.ready;

      const rename = sinon.stub(fs, "renameSync").throws(
        Object.assign(new Error("Injected rename failure"), { code: "EACCES" })
      );
      const save = sinon.spy(taskStore as any, "writeTasksToDisk");
      taskUpdated.fire({
        event: { id: "task-new", updatedAt: Date.now() + 1 },
      });
      if (synchronous) taskStore.dispose();
      await save.firstCall.returnValue;

      sinon.assert.calledOnce(rename);
      assert.deepStrictEqual(
        JSON.parse(await fsAsync.readFile(fileUri.fsPath, "utf8")),
        original
      );
      assert.deepStrictEqual(await fsAsync.readdir(tempStorageUri.fsPath), [
        "tasks.json",
      ]);
      rename.restore();
    });
  }

  it("flushes pending updates through the same commit when closed before the queued save", async () => {
    taskStore = new Store(context);
    await taskStore.ready;
    taskUpdated.fire({ event: { id: "first", updatedAt: Date.now() } });
    taskUpdated.fire({ event: { id: "last", updatedAt: Date.now() } });
    taskStore.dispose();
    await (taskStore as any).writeQueue;
    const saved = JSON.parse(await fsAsync.readFile(vscode.Uri.joinPath(tempStorageUri, "tasks.json").fsPath, "utf8"));
    assert.deepStrictEqual(Object.keys(saved).sort(), ["first", "last"]);
  });

  it("accepts LiveStore updates even when their timestamps move backwards", async () => {
    const file = vscode.Uri.joinPath(tempStorageUri, "tasks.json").fsPath;
    await fsAsync.writeFile(file, JSON.stringify({ task: { id: "task", updatedAt: Date.now() + 60000, title: "Old", status: "pending-model" } }));
    taskStore = new Store(context);
    await taskStore.ready;
    taskUpdated.fire({ event: { id: "task", updatedAt: Date.now(), title: "New", status: "completed" } });
    await (taskStore as any).writeQueue;
    assert.strictEqual(taskStore.tasks.value.task.title, "New");
    assert.strictEqual(JSON.parse(await fsAsync.readFile(file, "utf8")).task.status, "completed");
  });

  it("does not publish an idle window's old snapshot on close", async () => {
    const file = vscode.Uri.joinPath(tempStorageUri, "tasks.json").fsPath;
    await fsAsync.writeFile(file, JSON.stringify({ task: { id: "task", updatedAt: Date.now(), title: "Old" } }));
    taskStore = new Store(context);
    await taskStore.ready;
    const latest = { task: { id: "task", updatedAt: Date.now() - 100, title: "Latest from SQLite" } };
    await fsAsync.writeFile(file, JSON.stringify(latest));
    taskStore.dispose();
    assert.deepStrictEqual(JSON.parse(await fsAsync.readFile(file, "utf8")), latest);
  });

  it("does not restore cached rows that another window evicted", async () => {
    const file = vscode.Uri.joinPath(tempStorageUri, "tasks.json").fsPath;
    await fsAsync.writeFile(file, JSON.stringify({ old: { id: "old", updatedAt: Date.now() } }));
    taskStore = new Store(context);
    await taskStore.ready;
    await fsAsync.writeFile(file, "{}");
    taskUpdated.fire({ event: { id: "new", updatedAt: Date.now() } });
    await (taskStore as any).writeQueue;
    assert.deepStrictEqual(Object.keys(JSON.parse(await fsAsync.readFile(file, "utf8"))), ["new"]);
  });

  it("keeps updates received while the initial cache is being loaded", async () => {
    const file = vscode.Uri.joinPath(tempStorageUri, "tasks.json").fsPath;
    await fsAsync.writeFile(file, JSON.stringify({ cached: { id: "cached", updatedAt: Date.now() } }));
    taskStore = new Store(context);
    taskUpdated.fire({ event: { id: "incoming", updatedAt: Date.now() } });
    await taskStore.ready;
    await (taskStore as any).writeQueue;
    assert.ok(taskStore.tasks.value.incoming);
    assert.deepStrictEqual(Object.keys(JSON.parse(await fsAsync.readFile(file, "utf8"))).sort(), ["cached", "incoming"]);
  });

  it("retries failed cache evictions without restoring expired entries", async () => {
    const file = vscode.Uri.joinPath(tempStorageUri, "tasks.json").fsPath;
    await fsAsync.writeFile(file, JSON.stringify({ expired: { id: "expired", updatedAt: Date.now() - 120 * 86400000 } }));
    const write = sinon.stub(fs, "writeFileSync").throws(new Error("Injected disk full"));
    const remove = sinon.spy(fsAsync, "rm");
    taskStore = new Store(context);
    await taskStore.ready;
    assert.ok(JSON.parse(await fsAsync.readFile(file, "utf8")).expired);
    sinon.assert.notCalled(remove);
    write.restore();
    taskUpdated.fire({ event: { id: "new", updatedAt: Date.now() } });
    await (taskStore as any).writeQueue;
    assert.deepStrictEqual(Object.keys(JSON.parse(await fsAsync.readFile(file, "utf8"))), ["new"]);
  });

  it("keeps retention applied when closed before the queued cleanup commit", async () => {
    const file = vscode.Uri.joinPath(tempStorageUri, "tasks.json").fsPath;
    await fsAsync.writeFile(file, JSON.stringify({ expired: { id: "expired", updatedAt: Date.now() - 120 * 86400000 } }));
    taskStore = new Store(context);
    let notify!: () => void;
    const queued = new Promise<void>(resolve => { notify = resolve; });
    let release!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; });
    const original = (taskStore as any).writeTasksToDisk.bind(taskStore);
    sinon.stub(taskStore as any, "writeTasksToDisk").callsFake(async () => {
      notify();
      await paused;
      return original();
    });
    try {
      await queued;
      taskStore.dispose();
      release();
      await taskStore.ready;
      assert.deepStrictEqual(JSON.parse(await fsAsync.readFile(file, "utf8")), {});
    } finally { release(); }
  });

  it("backs up a corrupt file before flushing pending updates at shutdown", async () => {
    const file = vscode.Uri.joinPath(tempStorageUri, "tasks.json").fsPath;
    taskStore = new Store(context);
    await taskStore.ready;
    const damaged = '{"partial":';
    await fsAsync.writeFile(file, damaged);
    taskUpdated.fire({ event: { id: "new", updatedAt: Date.now() } });
    taskStore.dispose();
    const backup = (await fsAsync.readdir(tempStorageUri.fsPath)).find(name => name.startsWith("tasks.corrupted-"));
    assert.ok(backup);
    assert.strictEqual(await fsAsync.readFile(vscode.Uri.joinPath(tempStorageUri, backup).fsPath, "utf8"), damaged);
    assert.ok(JSON.parse(await fsAsync.readFile(file, "utf8")).new);
  });
});
