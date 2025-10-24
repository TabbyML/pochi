import { getLogger } from "@/lib/logger";
import simpleGit from "simple-git";

const logger = getLogger("WorktreeManager");

interface GitWorktree {
  path: string;
  branch?: string;
  commit: string;
  isMain: boolean;
}

export class WorktreeManager {
  private git: ReturnType<typeof simpleGit>;

  constructor(cwd: string) {
    this.git = simpleGit(cwd);
  }

  async getWorktrees(): Promise<GitWorktree[]> {
    try {
      const result = await this.git.raw(["worktree", "list", "--porcelain"]);
      return this.parseWorktreePorcelain(result);
    } catch (error) {
      logger.error("Failed to get worktrees:", error);
      return [];
    }
  }

  private parseWorktreePorcelain(output: string): GitWorktree[] {
    const worktrees: GitWorktree[] = [];
    const lines = output.trim().split("\n");

    let currentWorktree: Partial<GitWorktree> = {};

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        // Save previous worktree if exists
        if (currentWorktree.path) {
          worktrees.push(currentWorktree as GitWorktree);
        }
        // Start new worktree
        currentWorktree = {
          path: line.substring("worktree ".length),
          isMain: false,
        };
      } else if (line.startsWith("HEAD ")) {
        currentWorktree.commit = line.substring("HEAD ".length);
      } else if (line.startsWith("branch ")) {
        const branchRef = line.substring("branch ".length);
        // Extract branch name from refs/heads/branch-name
        currentWorktree.branch = branchRef.replace(/^refs\/heads\//, "");
      } else if (line === "bare") {
        // Bare repository
        currentWorktree.isMain = true;
      } else if (line === "detached") {
        // Detached HEAD state - no branch
        currentWorktree.branch = undefined;
      } else if (line === "") {
        // Empty line separates worktrees
        if (currentWorktree.path) {
          worktrees.push(currentWorktree as GitWorktree);
          currentWorktree = {};
        }
      }
    }

    // Add the last worktree if exists
    if (currentWorktree.path) {
      worktrees.push(currentWorktree as GitWorktree);
    }

    // Mark the first worktree as main if none are marked
    if (worktrees.length > 0 && !worktrees.some((w) => w.isMain)) {
      worktrees[0].isMain = true;
    }

    return worktrees;
  }
}
