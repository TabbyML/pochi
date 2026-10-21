import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { constants } from "../base";
import { copyWorktreeIncludeFiles } from "./worktree-include";
import { readWorktreeOwnerInfo, writeWorktreeOwner } from "./worktree-owner";

const execFilePromise = promisify(execFile);

const GitFetchTimeoutMs = 30_000;
const GitWorktreeAddTimeoutMs = 120_000;

export interface SubagentWorktree {
  path: string;
  branch: string;
  baseCommit: string;
}

async function git(
  cwd: string,
  args: string[],
  timeout = constants.GitOperationTimeoutMs,
): Promise<string> {
  const { stdout } = await execFilePromise("git", args, {
    cwd,
    timeout,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}

async function tryGit(
  cwd: string,
  args: string[],
  timeout?: number,
): Promise<string | undefined> {
  try {
    return await git(cwd, args, timeout);
  } catch {
    return undefined;
  }
}

async function getMainWorktreePath(cwd: string): Promise<string | undefined> {
  const output = await tryGit(cwd, ["worktree", "list", "--porcelain"]);
  const line = output?.split("\n").find((x) => x.startsWith("worktree "));
  return line?.slice("worktree ".length).trim() || undefined;
}

function getSubagentWorktreeLocation(mainWorktreePath: string, taskId: string) {
  const id = taskId
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 8)
    .toLowerCase();
  if (!id) throw new Error(`Invalid task id for a worktree: ${taskId}`);
  const parent = `${mainWorktreePath.replace(/[/\\]+$/, "")}.worktree`;
  return {
    path: path.join(parent, `subagent-${id}`),
    branch: `subagent/${id}`,
  };
}

/**
 * The cwd a subagent task runs in under worktree isolation. It is fixed by
 * the repository and the task id, so it is known before the worktree exists.
 */
export async function getSubagentWorktreePath(
  cwd: string,
  taskId: string,
): Promise<string | undefined> {
  const mainWorktreePath = await getMainWorktreePath(cwd);
  return mainWorktreePath
    ? getSubagentWorktreeLocation(mainWorktreePath, taskId).path
    : undefined;
}

async function resolveCommit(cwd: string, ref: string) {
  return tryGit(cwd, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
}

/** The latest commit of the default branch, preferring the remote. */
async function resolveDefaultBranchCommit(mainWorktreePath: string) {
  const remoteHead = await tryGit(mainWorktreePath, [
    "symbolic-ref",
    "--quiet",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);
  const remoteRefs = remoteHead
    ? [remoteHead]
    : ["origin/main", "origin/master"];
  for (const ref of remoteRefs) {
    if (!(await resolveCommit(mainWorktreePath, ref))) continue;
    await tryGit(
      mainWorktreePath,
      ["fetch", "--quiet", "--no-tags", "origin", ref.replace(/^origin\//, "")],
      GitFetchTimeoutMs,
    );
    const commit = await resolveCommit(mainWorktreePath, ref);
    if (commit) return commit;
  }
  for (const ref of ["main", "master", "HEAD"]) {
    const commit = await resolveCommit(mainWorktreePath, ref);
    if (commit) return commit;
  }
  throw new Error("Failed to resolve the default branch for the worktree.");
}

async function findSubagentWorktree(
  mainWorktreePath: string,
  taskId: string,
): Promise<SubagentWorktree | undefined> {
  const location = getSubagentWorktreeLocation(mainWorktreePath, taskId);
  const info = await readWorktreeOwnerInfo(location.path);
  if (
    info?.owner !== "subagent" ||
    info.taskId !== taskId ||
    !info.baseCommit
  ) {
    return undefined;
  }
  return {
    path: location.path,
    branch: info.branch ?? location.branch,
    baseCommit: info.baseCommit,
  };
}

/**
 * Creates (or reuses) the isolated worktree of a subagent task, checked out
 * on a new branch from the latest default branch.
 */
export async function createSubagentWorktree(
  cwd: string,
  taskId: string,
): Promise<SubagentWorktree> {
  const mainWorktreePath = await getMainWorktreePath(cwd);
  if (!mainWorktreePath) {
    throw new Error("Worktree isolation requires a git repository.");
  }
  const existing = await findSubagentWorktree(mainWorktreePath, taskId);
  if (existing) return existing;

  const location = getSubagentWorktreeLocation(mainWorktreePath, taskId);
  const baseCommit = await resolveDefaultBranchCommit(mainWorktreePath);
  await fs.mkdir(path.dirname(location.path), { recursive: true });
  await git(
    mainWorktreePath,
    ["worktree", "add", "-b", location.branch, location.path, baseCommit],
    GitWorktreeAddTimeoutMs,
  );
  try {
    await writeWorktreeOwner(location.path, "subagent", {
      taskId,
      branch: location.branch,
      baseCommit,
    });
    await copyWorktreeIncludeFiles(mainWorktreePath, location.path);
  } catch (error) {
    // Roll back so a half-created worktree never outlives a failed creation.
    await tryGit(mainWorktreePath, [
      "worktree",
      "remove",
      "--force",
      location.path,
    ]);
    await tryGit(mainWorktreePath, ["branch", "-D", location.branch]);
    throw error;
  }
  return { ...location, baseCommit };
}

/**
 * Removes the subagent worktree and its branch when the subagent left no
 * changes or commits; otherwise keeps it for the caller to inspect.
 */
export async function finalizeSubagentWorktree(
  cwd: string,
  taskId: string,
): Promise<{ worktree: SubagentWorktree; removed: boolean } | undefined> {
  const mainWorktreePath = await getMainWorktreePath(cwd);
  if (!mainWorktreePath) return undefined;
  const worktree = await findSubagentWorktree(mainWorktreePath, taskId);
  if (!worktree) return undefined;

  const status = await tryGit(worktree.path, ["status", "--porcelain"]);
  const head = await tryGit(worktree.path, ["rev-parse", "HEAD"]);
  if (status !== "" || head !== worktree.baseCommit) {
    return { worktree, removed: false };
  }
  try {
    await git(mainWorktreePath, ["worktree", "remove", worktree.path]);
  } catch {
    return { worktree, removed: false };
  }
  await tryGit(mainWorktreePath, ["branch", "-D", worktree.branch]);
  return { worktree, removed: true };
}
