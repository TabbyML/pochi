import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createSubagentWorktree,
  finalizeSubagentWorktree,
  getSubagentWorktreePath,
} from "../subagent-worktree";
import * as worktreeInclude from "../worktree-include";
import { readWorktreeOwnerInfo } from "../worktree-owner";

vi.mock("../worktree-include", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../worktree-include")>()),
  copyWorktreeIncludeFiles: vi.fn(
    (await importOriginal<typeof import("../worktree-include")>())
      .copyWorktreeIncludeFiles,
  ),
}));

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  }).trim();
}

async function commit(cwd: string, file: string, content: string) {
  await fs.writeFile(path.join(cwd, file), content);
  git(cwd, "add", file);
  git(cwd, "commit", "-q", "-m", `update ${file}`);
}

const taskId = "1a2b3c4d-0000-4000-8000-000000000000";

describe("subagent worktree", () => {
  let tmpDir: string;
  let repo: string;

  beforeAll(() => {
    process.env.GIT_AUTHOR_NAME = "test";
    process.env.GIT_AUTHOR_EMAIL = "test@example.com";
    process.env.GIT_COMMITTER_NAME = "test";
    process.env.GIT_COMMITTER_EMAIL = "test@example.com";
  });

  beforeEach(async () => {
    tmpDir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "pochi-subagent-worktree-")),
    );
    repo = path.join(tmpDir, "repo");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function setupRepoWithRemote() {
    const origin = path.join(tmpDir, "origin.git");
    const seed = path.join(tmpDir, "seed");
    git(tmpDir, "init", "-q", "--bare", "--initial-branch=main", origin);
    git(tmpDir, "clone", "-q", origin, seed);
    git(seed, "checkout", "-q", "-b", "main");
    await commit(seed, "a.txt", "a");
    git(seed, "push", "-q", "origin", "main");
    git(tmpDir, "clone", "-q", origin, repo);

    // The remote moves on after the clone; the local checkout diverges.
    await commit(seed, "b.txt", "b");
    git(seed, "push", "-q", "origin", "main");
    git(repo, "checkout", "-q", "-b", "feature");
    await commit(repo, "feature.txt", "feature");
    return git(seed, "rev-parse", "HEAD");
  }

  it("creates the worktree from the latest remote default branch", async () => {
    const latestRemoteCommit = await setupRepoWithRemote();

    const worktree = await createSubagentWorktree(repo, taskId);

    expect(worktree.path).toBe(
      path.join(`${repo}.worktree`, "subagent-1a2b3c4d"),
    );
    expect(worktree.branch).toBe("subagent/1a2b3c4d");
    expect(worktree.baseCommit).toBe(latestRemoteCommit);
    expect(git(worktree.path, "rev-parse", "HEAD")).toBe(latestRemoteCommit);
    expect(git(worktree.path, "branch", "--show-current")).toBe(
      "subagent/1a2b3c4d",
    );
    expect(await readWorktreeOwnerInfo(worktree.path)).toEqual({
      owner: "subagent",
      taskId,
      branch: worktree.branch,
      baseCommit: latestRemoteCommit,
    });
    expect(git(repo, "branch", "--show-current")).toBe("feature");
  });

  it("falls back to the local default branch without a remote", async () => {
    git(tmpDir, "init", "-q", "--initial-branch=main", repo);
    await commit(repo, "a.txt", "a");
    const mainCommit = git(repo, "rev-parse", "HEAD");
    git(repo, "checkout", "-q", "-b", "feature");
    await commit(repo, "feature.txt", "feature");

    const worktree = await createSubagentWorktree(repo, taskId);

    expect(worktree.baseCommit).toBe(mainCommit);
  });

  it("reuses the worktree of the same task and resolves it from a linked worktree", async () => {
    await setupRepoWithRemote();
    const worktree = await createSubagentWorktree(repo, taskId);

    expect(await createSubagentWorktree(worktree.path, taskId)).toEqual(
      worktree,
    );
    expect(await getSubagentWorktreePath(worktree.path, taskId)).toBe(
      worktree.path,
    );
    expect(
      await finalizeSubagentWorktree(
        repo,
        "ffffffff-0000-4000-8000-000000000000",
      ),
    ).toBeUndefined();
  });

  it("copies .worktreeinclude files", async () => {
    await setupRepoWithRemote();
    await fs.writeFile(path.join(repo, ".gitignore"), ".env\n");
    await fs.writeFile(path.join(repo, ".worktreeinclude"), ".env\n");
    await fs.writeFile(path.join(repo, ".env"), "SECRET=1");

    const worktree = await createSubagentWorktree(repo, taskId);

    expect(await fs.readFile(path.join(worktree.path, ".env"), "utf8")).toBe(
      "SECRET=1",
    );
  });

  it("rolls back a partially created worktree", async () => {
    await setupRepoWithRemote();
    vi.mocked(worktreeInclude.copyWorktreeIncludeFiles).mockRejectedValueOnce(
      new Error("copy failed"),
    );

    await expect(createSubagentWorktree(repo, taskId)).rejects.toThrow(
      "copy failed",
    );
    await expect(
      fs.access(path.join(`${repo}.worktree`, "subagent-1a2b3c4d")),
    ).rejects.toThrow();
    expect(git(repo, "branch", "--list", "subagent/1a2b3c4d")).toBe("");

    const worktree = await createSubagentWorktree(repo, taskId);
    expect(worktree.branch).toBe("subagent/1a2b3c4d");
  });

  it("removes a worktree without changes", async () => {
    await setupRepoWithRemote();
    const worktree = await createSubagentWorktree(repo, taskId);

    const result = await finalizeSubagentWorktree(repo, taskId);

    expect(result).toEqual({ worktree, removed: true });
    await expect(fs.access(worktree.path)).rejects.toThrow();
    expect(git(repo, "branch", "--list", worktree.branch)).toBe("");
  });

  it("keeps a worktree with uncommitted changes or new commits", async () => {
    await setupRepoWithRemote();
    const worktree = await createSubagentWorktree(repo, taskId);
    await fs.writeFile(path.join(worktree.path, "new.txt"), "new");

    expect(await finalizeSubagentWorktree(repo, taskId)).toEqual({
      worktree,
      removed: false,
    });

    git(worktree.path, "add", "new.txt");
    git(worktree.path, "commit", "-q", "-m", "new");
    expect(await finalizeSubagentWorktree(repo, taskId)).toEqual({
      worktree,
      removed: false,
    });
    await fs.access(worktree.path);
  });

  it("ignores tasks without an isolated worktree", async () => {
    await setupRepoWithRemote();

    expect(await finalizeSubagentWorktree(repo, taskId)).toBeUndefined();
  });
});
