import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Gets the main worktree path for the given directory.
 *
 * In git:
 * - Main worktree has a `.git` directory
 * - Non-main worktrees have a `.git` file containing `gitdir: <path>` pointing to
 *   the main repo's `.git/worktrees/<name>` directory
 *
 * @param cwd - The directory to check
 * @returns The main worktree path, or undefined if not a git repository
 */
export async function getMainWorktreePath(
  cwd: string,
): Promise<string | undefined> {
  const gitPath = path.join(cwd, ".git");
  try {
    const stat = await fs.stat(gitPath);
    if (stat.isDirectory()) {
      // This is the main worktree
      return cwd;
    }
    if (stat.isFile()) {
      // This is a non-main worktree, read the .git file to find the main worktree
      const content = await fs.readFile(gitPath, "utf8");
      const match = content.match(/^gitdir:\s*(.+)$/m);
      if (match) {
        // gitdir points to: /main/repo/.git/worktrees/<name>
        // Go up 3 levels to get: /main/repo
        const gitdir = match[1].trim();
        const mainGitDir = path.resolve(gitdir, "..", ".."); // .git directory
        const mainWorktreePath = path.dirname(mainGitDir); // main worktree
        return mainWorktreePath;
      }
    }
  } catch {
    // .git doesn't exist or can't be accessed
  }
  return undefined;
}
