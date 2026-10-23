import fs from "node:fs/promises";
import path from "node:path";

export type WorktreeOwner = "user" | "subagent";

export interface WorktreeOwnerInfo {
  owner: WorktreeOwner;
  taskId?: string;
  branch?: string;
  baseCommit?: string;
}

// Lives in the worktree's admin directory (`.git/worktrees/<id>/`), which git
// removes together with the worktree on `git worktree remove` / `prune`.
const OwnerFileName = "pochi.json";

async function getWorktreeGitDir(
  worktreePath: string,
): Promise<string | undefined> {
  let content: string;
  try {
    // Linked worktrees have a `.git` file; the main worktree has a directory.
    content = await fs.readFile(path.join(worktreePath, ".git"), "utf8");
  } catch {
    return undefined;
  }
  const gitDir = content.match(/^gitdir:\s*(.+)$/m)?.[1]?.trim();
  return gitDir ? path.resolve(worktreePath, gitDir) : undefined;
}

/**
 * Returns the marker recorded by Pochi, or undefined if the worktree was not
 * created by Pochi. A corrupted marker is treated as owned by the user.
 */
export async function readWorktreeOwnerInfo(
  worktreePath: string,
): Promise<WorktreeOwnerInfo | undefined> {
  const gitDir = await getWorktreeGitDir(worktreePath);
  if (!gitDir) return undefined;

  let content: string;
  try {
    content = await fs.readFile(path.join(gitDir, OwnerFileName), "utf8");
  } catch {
    return undefined;
  }
  try {
    const data = JSON.parse(content);
    if (data?.owner !== "subagent") return { owner: "user" };
    return {
      owner: "subagent",
      taskId: typeof data.taskId === "string" ? data.taskId : undefined,
      branch: typeof data.branch === "string" ? data.branch : undefined,
      baseCommit:
        typeof data.baseCommit === "string" ? data.baseCommit : undefined,
    };
  } catch {
    return { owner: "user" };
  }
}

export async function readWorktreeOwner(
  worktreePath: string,
): Promise<WorktreeOwner | undefined> {
  return (await readWorktreeOwnerInfo(worktreePath))?.owner;
}

export async function writeWorktreeOwner(
  worktreePath: string,
  owner: WorktreeOwner,
  metadata?: Omit<WorktreeOwnerInfo, "owner">,
): Promise<void> {
  const gitDir = await getWorktreeGitDir(worktreePath);
  if (!gitDir) {
    throw new Error(`Not a linked worktree: ${worktreePath}`);
  }
  await fs.writeFile(
    path.join(gitDir, OwnerFileName),
    JSON.stringify({
      createdBy: "pochi",
      createdAt: Date.now(),
      owner,
      ...metadata,
    }),
  );
}
