import * as assert from "node:assert";
import { execFileSync } from "node:child_process";
import * as os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "mocha";
import proxyquire from "proxyquire";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
  readWorktreeOwner,
  writeWorktreeOwner,
} from "@getpochi/common/tool-utils";

const { WorktreeManager } = proxyquire.noCallThru()("../worktree", {
  "@/lib/generate-branch-name": { generateBranchName: sinon.stub() },
  "../layout": { getViewColumnForTerminal: sinon.stub().returns(undefined) },
  "simple-git": sinon.stub().returns({
    revparse: sinon.stub().resolves("gitdir"),
    checkIsRepo: sinon.stub().resolves(false),
    raw: sinon.stub().resolves(""),
  }),
});

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

describe("worktree owner", () => {
  let tmpDir: vscode.Uri;
  let repo: string;

  const addWorktree = (name: string) => {
    const worktreePath = path.join(tmpDir.fsPath, name);
    git(repo, "worktree", "add", "-q", "-b", name, worktreePath);
    return worktreePath;
  };

  beforeEach(async () => {
    tmpDir = vscode.Uri.file(
      path.join(os.tmpdir(), `pochi-worktree-owner-${Date.now()}`),
    );
    repo = path.join(tmpDir.fsPath, "repo");
    await vscode.workspace.fs.createDirectory(vscode.Uri.file(repo));
    git(repo, "init", "-q");
    git(
      repo,
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "-q",
      "--allow-empty",
      "-m",
      "init",
    );
  });

  afterEach(async () => {
    sinon.restore();
    await vscode.workspace.fs.delete(tmpDir, { recursive: true });
  });

  it("writes the marker into the worktree admin dir, not the checkout", async () => {
    const worktreePath = addWorktree("wt-user");

    await writeWorktreeOwner(worktreePath, "user");

    const adminDir = git(worktreePath, "rev-parse", "--absolute-git-dir");
    const content = JSON.parse(
      new TextDecoder().decode(
        await vscode.workspace.fs.readFile(
          vscode.Uri.file(path.join(adminDir, "pochi.json")),
        ),
      ),
    );
    assert.strictEqual(content.createdBy, "pochi");
    assert.strictEqual(content.owner, "user");
    assert.strictEqual(typeof content.createdAt, "number");
    assert.strictEqual(git(worktreePath, "status", "--porcelain"), "");
    assert.strictEqual(await readWorktreeOwner(worktreePath), "user");
  });

  it("returns undefined for unmarked and main worktrees", async () => {
    const worktreePath = addWorktree("wt-foreign");

    assert.strictEqual(await readWorktreeOwner(worktreePath), undefined);
    assert.strictEqual(await readWorktreeOwner(repo), undefined);
  });

  it("rejects writing a marker to the main worktree", async () => {
    await assert.rejects(writeWorktreeOwner(repo, "user"));
  });

  it("treats a corrupted marker as owned by the user", async () => {
    const worktreePath = addWorktree("wt-corrupted");
    const adminDir = git(worktreePath, "rev-parse", "--absolute-git-dir");
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(path.join(adminDir, "pochi.json")),
      new TextEncoder().encode("{not json"),
    );

    assert.strictEqual(await readWorktreeOwner(worktreePath), "user");
  });

  it("lists only the main, user-owned and legacy task worktrees", async () => {
    const userWorktree = addWorktree("wt-user");
    const subagentWorktree = addWorktree("wt-subagent");
    const foreignWorktree = addWorktree("wt-foreign");
    const legacyWorktree = addWorktree("wt-legacy");
    const subtaskOnlyWorktree = addWorktree("wt-subtask-only");
    await writeWorktreeOwner(userWorktree, "user");
    await writeWorktreeOwner(subagentWorktree, "subagent");

    const worktreeManager = new WorktreeManager(
      { workspacePath: repo },
      {},
      {},
      { detectWorktreesLimit: { value: 10 } },
      {
        ready: Promise.resolve(),
        tasks: {
          value: {
            legacy: { id: "legacy", parentId: null, cwd: legacyWorktree },
            subtask: {
              id: "subtask",
              parentId: "legacy",
              cwd: subtaskOnlyWorktree,
            },
          },
        },
      },
      { getArchivedSignal: () => ({ value: {} }) },
    );

    const all = [
      repo,
      userWorktree,
      subagentWorktree,
      foreignWorktree,
      legacyWorktree,
      subtaskOnlyWorktree,
    ].map((p, i) => ({ path: p, commit: "", isMain: i === 0 }));
    const result = await worktreeManager.filterUserWorktrees(all);

    assert.deepStrictEqual(
      result.map((wt: { path: string }) => wt.path),
      [repo, userWorktree, legacyWorktree],
    );
    worktreeManager.dispose();
  });
});
