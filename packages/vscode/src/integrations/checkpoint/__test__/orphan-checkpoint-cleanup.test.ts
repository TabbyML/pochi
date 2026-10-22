import * as assert from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import simpleGit from "simple-git";
import * as vscode from "vscode";
import {
  type OrphanCheckpointCleanupOptions,
  cleanupOrphanCheckpoints,
} from "../orphan-checkpoint-cleanup";

const DayMs = 24 * 60 * 60 * 1000;
const ExtensionId = "TabbyML.pochi";

describe("cleanupOrphanCheckpoints", () => {
  let rootDir: string;
  let options: OrphanCheckpointCleanupOptions;

  const exists = (file: string) =>
    fs.stat(file).then(
      () => true,
      () => false,
    );

  /** Dates every file of `dir` as last written `daysAgo` days ago. */
  const age = async (dir: string, daysAgo: number) => {
    const time = new Date(Date.now() - daysAgo * DayMs);
    const entries = await fs.readdir(dir, {
      recursive: true,
      withFileTypes: true,
    });
    for (const entry of entries) {
      if (entry.isFile()) {
        await fs.utimes(path.join(entry.parentPath, entry.name), time, time);
      }
    }
  };

  /** Creates a checkpoint repository whose core.worktree is `worktree`. */
  const createRepo = async (
    gitPath: string,
    worktree: string,
    daysAgo: number,
  ) => {
    await fs.mkdir(gitPath, { recursive: true });
    await simpleGit().raw(["init", "--bare", "-q", gitPath]);
    await simpleGit().raw([
      "config",
      "--file",
      path.join(gitPath, "config"),
      "core.worktree",
      worktree,
    ]);
    await age(gitPath, daysAgo);
    return gitPath;
  };

  /**
   * Creates a checkpoint repository in a VS Code workspace storage directory
   * that records `folder`.
   */
  const createWorkspaceRepo = async (
    id: string,
    folder: string | undefined,
    daysAgo: number,
    worktree = folder ?? "",
  ) => {
    const workspaceDir = path.join(options.workspaceStorageHome, id);
    await fs.mkdir(workspaceDir, { recursive: true });
    if (folder !== undefined) {
      const uri = folder.includes("://") ? folder : vscode.Uri.file(folder);
      await fs.writeFile(
        path.join(workspaceDir, "workspace.json"),
        JSON.stringify({ folder: uri.toString() }),
      );
    }
    return createRepo(
      path.join(workspaceDir, ExtensionId, "checkpoint"),
      worktree,
      daysAgo,
    );
  };

  beforeEach(async () => {
    rootDir = path.join(os.tmpdir(), `pochi-orphan-checkpoints-${Date.now()}`);
    options = {
      workspaceStorageHome: path.join(rootDir, "workspaceStorage"),
      globalStorageDir: path.join(rootDir, "globalStorage", "tabbyml.pochi"),
      extensionId: ExtensionId,
      retentionMs: 90 * DayMs,
      intervalMs: DayMs,
    };
    await fs.mkdir(path.join(rootDir, "projects", "alive"), {
      recursive: true,
    });
  });

  afterEach(async () => {
    await fs.rm(rootDir, { recursive: true, force: true });
  });

  it("deletes old repositories of missing folders", async () => {
    const alive = path.join(rootDir, "projects", "alive");
    const missing = path.join(rootDir, "projects", "missing");
    const orphan = await createWorkspaceRepo("orphan", missing, 100);
    const recentOrphan = await createWorkspaceRepo("recent", missing, 10);
    const oldAlive = await createWorkspaceRepo("alive", alive, 400);
    // core.worktree names a deleted linked worktree, but the folder VS Code
    // recorded is still there.
    const deletedWorktree = await createWorkspaceRepo(
      "worktree",
      alive,
      400,
      path.join(rootDir, "projects", "alive.worktree", "gone"),
    );
    const remote = await createWorkspaceRepo(
      "remote",
      "vscode-remote://ssh-remote%2Bhost/home/user/project",
      400,
    );
    // Without workspace.json, core.worktree tells the folder.
    const noWorkspaceFile = await createWorkspaceRepo(
      "no-workspace-file",
      undefined,
      100,
      missing,
    );
    const globalOrphan = await createRepo(
      path.join(options.globalStorageDir, "0123abcd", "checkpoint"),
      missing,
      100,
    );
    const globalAlive = await createRepo(
      path.join(options.globalStorageDir, "4567cdef", "checkpoint"),
      alive,
      100,
    );
    await fs.writeFile(path.join(options.globalStorageDir, "tasks.json"), "");

    const deleted = await cleanupOrphanCheckpoints(options);

    assert.deepStrictEqual(
      [...deleted].sort(),
      [orphan, noWorkspaceFile, globalOrphan].sort(),
    );
    for (const repo of deleted) {
      assert.strictEqual(await exists(repo), false);
    }
    // Emptied parent directories go too, but VS Code's own files stay.
    assert.strictEqual(await exists(path.dirname(orphan)), false);
    assert.strictEqual(await exists(path.dirname(globalOrphan)), false);
    assert.strictEqual(
      await exists(
        path.join(options.workspaceStorageHome, "orphan", "workspace.json"),
      ),
      true,
    );
    for (const repo of [
      recentOrphan,
      oldAlive,
      deletedWorktree,
      remote,
      globalAlive,
    ]) {
      assert.strictEqual(await exists(path.join(repo, "HEAD")), true, repo);
    }
  });

  it("keeps repositories that are still opened", async () => {
    const missing = path.join(rootDir, "projects", "missing");
    const repo = await createWorkspaceRepo("orphan", missing, 100);
    // Opening a repository rewrites its exclude file.
    await fs.writeFile(path.join(repo, "info", "exclude"), "node_modules");

    assert.deepStrictEqual(await cleanupOrphanCheckpoints(options), []);
    assert.strictEqual(await exists(path.join(repo, "HEAD")), true);
  });

  it("keeps repositories of folders on unmounted volumes", async function () {
    if (process.platform === "win32") this.skip();
    const repo = await createWorkspaceRepo(
      "volume",
      `/Volumes/pochi-missing-volume-${Date.now()}/project`,
      400,
    );

    assert.deepStrictEqual(await cleanupOrphanCheckpoints(options), []);
    assert.strictEqual(await exists(path.join(repo, "HEAD")), true);
  });

  it("runs at most once per interval", async () => {
    const missing = path.join(rootDir, "projects", "missing");
    const first = await createWorkspaceRepo("first", missing, 100);
    assert.deepStrictEqual(await cleanupOrphanCheckpoints(options), [first]);

    const second = await createWorkspaceRepo("second", missing, 100);
    assert.deepStrictEqual(await cleanupOrphanCheckpoints(options), []);
    assert.strictEqual(await exists(path.join(second, "HEAD")), true);

    assert.deepStrictEqual(
      await cleanupOrphanCheckpoints({ ...options, intervalMs: 0 }),
      [second],
    );
  });
});
