import fs from "node:fs/promises";
import path from "node:path";

export type WorktreeOwner = "user" | "subagent";

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
 * Returns the owner recorded by Pochi, or undefined if the worktree was not
 * created by Pochi.
 */
export async function readWorktreeOwner(
  worktreePath: string,
): Promise<WorktreeOwner | undefined> {
  const gitDir = await getWorktreeGitDir(worktreePath);
  if (!gitDir) return undefined;

  let content: string;
  try {
    content = await fs.readFile(path.join(gitDir, OwnerFileName), "utf8");
  } catch {
    return undefined;
  }
  try {
    return JSON.parse(content)?.owner === "subagent" ? "subagent" : "user";
  } catch {
    return "user";
  }
}

export async function writeWorktreeOwner(
  worktreePath: string,
  owner: WorktreeOwner,
): Promise<void> {
  const gitDir = await getWorktreeGitDir(worktreePath);
  if (!gitDir) {
    throw new Error(`Not a linked worktree: ${worktreePath}`);
  }
  await fs.writeFile(
    path.join(gitDir, OwnerFileName),
    JSON.stringify({ createdBy: "pochi", createdAt: Date.now(), owner }),
  );
}
