import * as assert from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import * as vscode from "vscode";
import {
  type LegacyCheckpointCleanupOptions,
  removeLegacyCheckpoints,
  runLegacyCheckpointCleanup,
} from "../legacy-checkpoint-cleanup";

const ExtensionId = "TabbyML.pochi";

class FakeMemento {
  private readonly values = new Map<string, unknown>();

  constructor(initial: Record<string, unknown> = {}) {
    for (const [key, value] of Object.entries(initial)) {
      this.values.set(key, value);
    }
  }

  keys() {
    return [...this.values.keys()];
  }

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown) {
    if (value === undefined) {
      this.values.delete(key);
    } else {
      this.values.set(key, value);
    }
  }
}

describe("legacy checkpoint cleanup", () => {
  let rootDir: string;
  let options: LegacyCheckpointCleanupOptions;

  const exists = (file: string) =>
    fs.stat(file).then(
      () => true,
      () => false,
    );

  /** Creates a directory that looks like a checkpoint git directory. */
  const createRepo = async (gitPath: string) => {
    await fs.mkdir(path.join(gitPath, "objects"), { recursive: true });
    await fs.writeFile(path.join(gitPath, "HEAD"), "ref: refs/heads/main\n");
    return gitPath;
  };

  const workspaceRepo = (id: string) =>
    path.join(options.workspaceStorageHome, id, ExtensionId, "checkpoint");

  beforeEach(async () => {
    rootDir = path.join(os.tmpdir(), `pochi-legacy-checkpoints-${Date.now()}`);
    options = {
      workspaceStorageHome: path.join(rootDir, "User", "workspaceStorage"),
      globalStorageDir: path.join(rootDir, "User", "globalStorage", ExtensionId),
      extensionId: ExtensionId,
    };
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("deletes checkpoint repositories in workspace and global storage", async () => {
    const workspace = await createRepo(workspaceRepo("a"));
    const global = await createRepo(
      path.join(options.globalStorageDir, "0123abcd", "checkpoint"),
    );

    const deleted = await removeLegacyCheckpoints(options);

    assert.deepStrictEqual(deleted.sort(), [global, workspace].sort());
    assert.strictEqual(await exists(workspace), false);
    assert.strictEqual(await exists(global), false);
    // The emptied parent directories go too.
    assert.strictEqual(await exists(path.dirname(workspace)), false);
    assert.strictEqual(await exists(path.dirname(global)), false);
  });

  it("keeps other files in the storage directories", async () => {
    const workspace = await createRepo(workspaceRepo("a"));
    const otherFile = path.join(path.dirname(workspace), "other.json");
    await fs.writeFile(otherFile, "{}");
    await fs.mkdir(options.globalStorageDir, { recursive: true });
    const tasksFile = path.join(options.globalStorageDir, "tasks.json");
    await fs.writeFile(tasksFile, "");

    await removeLegacyCheckpoints(options);

    assert.strictEqual(await exists(workspace), false);
    assert.strictEqual(await exists(otherFile), true);
    assert.strictEqual(await exists(tasksFile), true);
  });

  it("skips checkpoint directories that are not git directories", async () => {
    const notRepo = workspaceRepo("b");
    await fs.mkdir(notRepo, { recursive: true });
    await fs.writeFile(path.join(notRepo, "notes.txt"), "");

    const deleted = await removeLegacyCheckpoints(options);

    assert.deepStrictEqual(deleted, []);
    assert.strictEqual(await exists(notRepo), true);
  });

  it("removes the marker file of the old orphan cleanup", async () => {
    await fs.mkdir(options.globalStorageDir, { recursive: true });
    const marker = path.join(
      options.globalStorageDir,
      "checkpoint-orphan-cleanup",
    );
    await fs.writeFile(marker, "");

    await removeLegacyCheckpoints(options);

    assert.strictEqual(await exists(marker), false);
  });

  it("does nothing when the storage directories are missing", async () => {
    assert.deepStrictEqual(await removeLegacyCheckpoints(options), []);
  });

  describe("runLegacyCheckpointCleanup", () => {
    const createContext = (globalState = new FakeMemento()) => {
      const workspaceState = new FakeMemento({
        "pochi.userEditState.branchBaselines:/repo": { task: {} },
        "pochi.userEditState.branchBaselines:": { task: {} },
        "pochi.other": 1,
      });
      const context = {
        globalState,
        workspaceState,
        globalStorageUri: vscode.Uri.file(options.globalStorageDir),
        extension: { id: ExtensionId },
      } as unknown as vscode.ExtensionContext;
      return { context, workspaceState, globalState };
    };

    it("clears user edit baselines and deletes repositories once", async () => {
      const { context, workspaceState, globalState } = createContext();
      const first = await createRepo(workspaceRepo("a"));

      await runLegacyCheckpointCleanup(context);

      assert.deepStrictEqual(workspaceState.keys(), ["pochi.other"]);
      assert.strictEqual(await exists(first), false);
      assert.strictEqual(
        globalState.get("pochi.legacyCheckpointCleanup.done"),
        true,
      );

      // A later activation leaves repositories alone.
      const second = await createRepo(workspaceRepo("b"));
      await runLegacyCheckpointCleanup(context);
      assert.strictEqual(await exists(second), true);
    });

    it("still clears user edit baselines after the one-time cleanup", async () => {
      const { context, workspaceState } = createContext(
        new FakeMemento({ "pochi.legacyCheckpointCleanup.done": true }),
      );

      await runLegacyCheckpointCleanup(context);

      assert.deepStrictEqual(workspaceState.keys(), ["pochi.other"]);
    });
  });
});
