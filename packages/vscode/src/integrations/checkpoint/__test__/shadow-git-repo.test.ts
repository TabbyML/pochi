import * as assert from "node:assert";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import simpleGit, { type SimpleGit } from "simple-git";
import * as vscode from "vscode";
import { ShadowGitRepo } from "../shadow-git-repo";

const LargeFileSize = 5 * 1024 * 1024 + 1;
const DayMs = 24 * 60 * 60 * 1000;

describe("ShadowGitRepo", () => {
  let rootUri: vscode.Uri;
  let workspaceDir: string;
  let gitPath: string;
  let repo: ShadowGitRepo;
  let git: SimpleGit;

  const writeFile = (file: string, content: string | Uint8Array) =>
    vscode.workspace.fs.writeFile(
      vscode.Uri.file(path.join(workspaceDir, file)),
      typeof content === "string" ? new TextEncoder().encode(content) : content,
    );

  const treeFiles = async (rev: string) =>
    (await git.raw(["ls-tree", "-r", "--name-only", rev]))
      .split("\n")
      .filter(Boolean);

  const indexFiles = async () =>
    (await git.raw(["ls-files"])).split("\n").filter(Boolean);

  const revList = async (rev: string) =>
    (await git.raw(["rev-list", rev])).split("\n").filter(Boolean);

  const objectExists = async (oid: string) => {
    try {
      await git.raw(["cat-file", "-e", oid]);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Dates every object file as written long ago, as in a repository that has
   * been in use for months. gc keeps unreachable objects younger than an hour.
   */
  const ageObjects = async () => {
    const past = new Date(Date.now() - 200 * DayMs);
    const objectsDir = path.join(gitPath, "objects");
    for (const dir of await fs.readdir(objectsDir)) {
      const dirPath = path.join(objectsDir, dir);
      if (!(await fs.stat(dirPath)).isDirectory()) continue;
      for (const file of await fs.readdir(dirPath)) {
        const filePath = path.join(dirPath, file);
        if ((await fs.stat(filePath)).isFile()) {
          await fs.utimes(filePath, past, past);
        }
      }
    }
  };

  /** Commits the workspace as it is, dated `daysAgo` days in the past. */
  const commitAt = async (daysAgo: number, message: string) => {
    const date = new Date(Date.now() - daysAgo * DayMs).toISOString();
    const datedGit = simpleGit(gitPath).env({
      ...process.env,
      GIT_DIR: gitPath,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
    });
    await datedGit.raw(["--work-tree", workspaceDir, "add", "."]);
    await datedGit.raw([
      "--work-tree",
      workspaceDir,
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      message,
    ]);
    return (await git.revparse(["HEAD"])).trim();
  };

  beforeEach(async () => {
    rootUri = vscode.Uri.file(
      path.join(os.tmpdir(), `pochi-shadow-git-${Date.now()}`),
    );
    workspaceDir = path.join(rootUri.fsPath, "workspace");
    gitPath = path.join(rootUri.fsPath, "shadow");
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(workspaceDir));
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(gitPath));
    git = simpleGit(gitPath).env({ ...process.env, GIT_DIR: gitPath });
  });

  afterEach(async () => {
    repo?.dispose();
    await vscode.workspace.fs.delete(rootUri, {
      recursive: true,
      useTrash: false,
    });
  });

  describe("stageAll", () => {
    it("leaves large files out of checkpoints", async () => {
      await writeFile("small.txt", "v1");
      await writeFile("gone.txt", "bye");
      await writeFile("sub/grow [1].txt", "small for now");
      repo = await ShadowGitRepo.getOrCreate(gitPath, workspaceDir);

      await writeFile("small.txt", "v2");
      await vscode.workspace.fs.delete(
        vscode.Uri.file(path.join(workspaceDir, "gone.txt")),
      );
      await writeFile("sub/big *.wasm", new Uint8Array(LargeFileSize));
      await writeFile("sub/grow [1].txt", new Uint8Array(LargeFileSize));

      await repo.stageAll();
      assert.strictEqual(await repo.hasStagedChanges(), true);
      await repo.commit("checkpoint");

      assert.deepStrictEqual(await treeFiles("HEAD"), ["small.txt"]);
      assert.deepStrictEqual(await indexFiles(), ["small.txt"]);
      assert.strictEqual(await git.show(["HEAD:small.txt"]), "v2");

      // The large files stay untracked, so the next save sees no change.
      await repo.stageAll();
      assert.strictEqual(await repo.hasStagedChanges(), false);
    });

    it("drops unchanged large files that an earlier checkpoint holds", async () => {
      await writeFile("small.txt", "v1");
      repo = await ShadowGitRepo.getOrCreate(gitPath, workspaceDir);
      // Checkpoints saved before the size limit could hold large files.
      await writeFile("Electron Framework", new Uint8Array(LargeFileSize));
      await commitAt(0, "before the size limit");
      assert.deepStrictEqual(await treeFiles("HEAD"), ["Electron Framework", "small.txt"]);

      await repo.stageAll();
      assert.strictEqual(await repo.hasStagedChanges(), true);
      await repo.commit("checkpoint");
      assert.deepStrictEqual(await treeFiles("HEAD"), ["small.txt"]);
      const stat = await vscode.workspace.fs.stat(
        vscode.Uri.file(path.join(workspaceDir, "Electron Framework")),
      );
      assert.strictEqual(stat.size, LargeFileSize);
    });

    it("stages a file again once it is small", async () => {
      await writeFile("data.json", new Uint8Array(LargeFileSize));
      repo = await ShadowGitRepo.getOrCreate(gitPath, workspaceDir);
      assert.deepStrictEqual(await treeFiles("HEAD"), []);

      await writeFile("data.json", "{}");
      await repo.stageAll();
      assert.strictEqual(await repo.hasStagedChanges(), true);
      await repo.commit("checkpoint");
      assert.deepStrictEqual(await treeFiles("HEAD"), ["data.json"]);
    });
  });

  describe("pruneCheckpoints", () => {
    it("deletes old checkpoints and keeps recent hashes", async () => {
      await writeFile("file.txt", "initial");
      repo = await ShadowGitRepo.getOrCreate(gitPath, workspaceDir);
      await git.raw(["config", "core.logAllRefUpdates", "true"]);

      await writeFile("file.txt", "old 1");
      await writeFile("old-only.txt", "old blob");
      const old1 = await commitAt(200, "old 1");
      const oldBlob = (
        await git.raw(["rev-parse", `${old1}:old-only.txt`])
      ).trim();
      await vscode.workspace.fs.delete(
        vscode.Uri.file(path.join(workspaceDir, "old-only.txt")),
      );
      await writeFile("file.txt", "old 2");
      const old2 = await commitAt(100, "old 2");
      await writeFile("file.txt", "recent 1");
      const recent1 = await commitAt(10, "recent 1");
      await writeFile("file.txt", "recent 2");
      const recent2 = await commitAt(5, "recent 2");
      await writeFile("file.txt", "recent 3");
      const recent3 = await commitAt(1, "recent 3");
      // Restoring an earlier checkpoint leaves recent3 reachable only from
      // the reflog.
      await repo.reset(recent2);
      await ageObjects();

      assert.strictEqual(await repo.pruneCheckpoints(90 * DayMs, 0), true);

      assert.strictEqual(await objectExists(old1), false);
      assert.strictEqual(await objectExists(oldBlob), false);
      for (const commit of [recent1, recent2, recent3]) {
        assert.strictEqual(await objectExists(commit), true);
      }
      // old2 is still named by recent1's reflog entry, so it stays as the
      // base of recent1, without its own history.
      assert.deepStrictEqual(await revList("HEAD"), [recent2, recent1, old2]);
      await git.raw(["fsck", "--no-dangling"]);

      // Checkpoints keep working after the prune.
      await writeFile("file.txt", "after prune");
      await repo.stageAll();
      const afterPrune = await repo.commit("after prune");
      assert.strictEqual(
        (await revList("HEAD"))[0].startsWith(afterPrune),
        true,
      );
      await repo.reset(recent1);
      assert.strictEqual(
        new TextDecoder().decode(
          await vscode.workspace.fs.readFile(
            vscode.Uri.file(path.join(workspaceDir, "file.txt")),
          ),
        ),
        "recent 1",
      );

      // Nothing new is old enough, so a second prune skips gc.
      assert.strictEqual(await repo.pruneCheckpoints(90 * DayMs, 0), false);
      await git.raw(["fsck", "--no-dangling"]);
    });

    it("keeps the latest checkpoint even when it is old", async () => {
      await writeFile("file.txt", "initial");
      repo = await ShadowGitRepo.getOrCreate(gitPath, workspaceDir);
      await writeFile("file.txt", "old 1");
      const old1 = await commitAt(200, "old 1");
      await writeFile("file.txt", "old 2");
      const old2 = await commitAt(100, "old 2");
      await ageObjects();

      assert.strictEqual(await repo.pruneCheckpoints(90 * DayMs, 0), true);

      assert.strictEqual(await objectExists(old1), false);
      assert.strictEqual(await objectExists(old2), true);
      assert.deepStrictEqual(await revList("HEAD"), [old2]);
      await git.raw(["fsck", "--no-dangling"]);
    });

    it("runs at most once per interval", async () => {
      await writeFile("file.txt", "initial");
      repo = await ShadowGitRepo.getOrCreate(gitPath, workspaceDir);
      await writeFile("file.txt", "old 1");
      const old1 = await commitAt(200, "old 1");
      await writeFile("file.txt", "old 2");
      const old2 = await commitAt(100, "old 2");
      await writeFile("file.txt", "recent");
      const recent = await commitAt(1, "recent");
      await ageObjects();

      assert.strictEqual(await repo.pruneCheckpoints(90 * DayMs, DayMs), true);
      assert.strictEqual(await objectExists(old1), false);

      await writeFile("file.txt", "recent 2");
      const recent2 = await commitAt(1, "recent 2");
      await ageObjects();
      // A retention of 0 would prune recent, but the last prune was just now.
      assert.strictEqual(await repo.pruneCheckpoints(0, DayMs), false);
      assert.deepStrictEqual(await revList("HEAD"), [recent2, recent, old2]);
    });
  });
});
