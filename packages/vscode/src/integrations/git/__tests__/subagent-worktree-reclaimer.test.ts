import * as assert from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { TaskDataStore } from "@/lib/task-data-store";
import { WorkspaceScope } from "@/lib/workspace-scoped";
import { createSubagentWorktree } from "@getpochi/common/tool-utils";
import { after, afterEach, before, beforeEach, describe, it } from "mocha";
import type * as vscode from "vscode";
import { SubagentWorktreeReclaimer } from "../subagent-worktree-reclaimer";

const parentTaskId = "aaaaaaaa-0000-4000-8000-000000000000";
const otherParentTaskId = "bbbbbbbb-0000-4000-8000-000000000000";
const taskId = "1a2b3c4d-0000-4000-8000-000000000000";
const otherTaskId = "2b3c4d5e-0000-4000-8000-000000000000";

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

async function exists(file: string) {
  return fs.access(file).then(
    () => true,
    () => false,
  );
}

function createTaskDataStore() {
  let persisted: Record<string, unknown> = {};
  const context = {
    globalState: {
      get: () => persisted,
      update: async (_key: string, value: Record<string, unknown>) => {
        persisted = value;
      },
    },
  } as unknown as vscode.ExtensionContext;
  return new TaskDataStore(context);
}

describe("SubagentWorktreeReclaimer", () => {
  const gitEnv = {
    GIT_AUTHOR_NAME: "test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  };
  const savedEnv: Record<string, string | undefined> = {};
  let tmpDir: string;
  let repo: string;
  let reclaimer: SubagentWorktreeReclaimer | undefined;

  before(() => {
    for (const [key, value] of Object.entries(gitEnv)) {
      savedEnv[key] = process.env[key];
      process.env[key] = value;
    }
  });

  after(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  beforeEach(async () => {
    tmpDir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "pochi-reclaimer-")),
    );
    repo = path.join(tmpDir, "repo");
    git(tmpDir, "init", "-q", "--initial-branch=main", repo);
    await fs.writeFile(path.join(repo, "a.txt"), "a");
    git(repo, "add", "a.txt");
    git(repo, "commit", "-q", "-m", "init");
  });

  afterEach(async () => {
    reclaimer?.dispose();
    reclaimer = undefined;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function createReclaimer(store: TaskDataStore) {
    reclaimer = new SubagentWorktreeReclaimer(
      new WorkspaceScope(repo, null),
      store,
    );
    return reclaimer;
  }

  it("discards the subagent worktrees of a task once it is archived", async () => {
    const worktree = await createSubagentWorktree(repo, taskId, parentTaskId);
    const other = await createSubagentWorktree(
      repo,
      otherTaskId,
      otherParentTaskId,
    );
    await fs.writeFile(path.join(worktree.path, "dirty.txt"), "dirty");
    const store = createTaskDataStore();
    const instance = createReclaimer(store);
    await instance.idle;
    assert.ok(await exists(worktree.path));

    await store.setArchived({ [parentTaskId]: true });
    await instance.idle;

    assert.strictEqual(await exists(worktree.path), false);
    assert.strictEqual(git(repo, "branch", "--list", worktree.branch), "");
    assert.ok(await exists(other.path));
  });

  it("discards worktrees of tasks archived before startup", async () => {
    const worktree = await createSubagentWorktree(repo, taskId, parentTaskId);
    const store = createTaskDataStore();
    await store.setArchived({ [parentTaskId]: true });

    await createReclaimer(store).idle;

    assert.strictEqual(await exists(worktree.path), false);
  });

  it("keeps worktrees of unarchived tasks", async () => {
    const worktree = await createSubagentWorktree(repo, taskId, parentTaskId);
    const store = createTaskDataStore();
    await store.setArchived({ [otherParentTaskId]: true });
    const instance = createReclaimer(store);
    await store.setArchived({ [parentTaskId]: false });
    await instance.idle;

    assert.ok(await exists(worktree.path));
  });
});
