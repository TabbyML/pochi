import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Workspace a spec runs against:
 * - `plain`: a folder without git
 * - `git`: a git repository with one commit (folder name `git-repo`)
 * - `git-worktrees`: a git repository with a linked worktree on `worktree-branch`
 * - `none`: no folder open
 */
export type WorkspaceKind = "plain" | "git" | "git-worktrees" | "none";

async function git(cwd: string, ...args: string[]) {
  await execFileAsync("git", args, { cwd });
}

async function initRepo(dir: string, readme: string) {
  await fs.mkdir(dir, { recursive: true });
  await git(dir, "init", "-q", "-b", "main");
  await git(dir, "config", "user.email", "test@example.com");
  await git(dir, "config", "user.name", "Test User");
  await fs.writeFile(path.join(dir, "README.md"), readme);
  await git(dir, "add", ".");
  await git(dir, "commit", "-q", "-m", "Initial commit");
}

/**
 * Create a workspace of `kind` under `root`.
 * Returns the folder to open, or undefined for `none`.
 */
export async function createWorkspace(
  kind: WorkspaceKind,
  root: string,
): Promise<string | undefined> {
  switch (kind) {
    case "none":
      return undefined;
    case "plain": {
      const dir = path.join(root, "plain");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "README.md"), "# Plain Folder");
      return dir;
    }
    case "git": {
      const dir = path.join(root, "git-repo");
      await initRepo(dir, "# Git Repo");
      return dir;
    }
    case "git-worktrees": {
      const dir = path.join(root, "git-worktrees");
      await initRepo(dir, "# Main Repo");
      await git(
        dir,
        "worktree",
        "add",
        "-q",
        path.join(root, "git-worktree-linked"),
        "-b",
        "worktree-branch",
      );
      return dir;
    }
  }
}
