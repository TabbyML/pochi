import { exec } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Workspace types supported by the test system
 */
export enum WorkspaceType {
  PLAIN = "plain",
  GIT_REPO = "git-repo",
  GIT_WORKTREES = "git-worktrees",
  NONE = "none",
}

/**
 * Get the session-based temp directory for test workspaces
 * Uses POCHI_TEST_SESSION_ID from environment for deterministic paths
 */
function getSessionTempDir(): string {
  const sessionId = process.env.POCHI_TEST_SESSION_ID;
  if (!sessionId) {
    throw new Error(
      "POCHI_TEST_SESSION_ID environment variable is not set. This should be set in wdio.conf.ts onPrepare.",
    );
  }
  return path.resolve(".wdio-vscode-service", `pochi-test-${sessionId}`);
}

/**
 * Get the deterministic workspace path for a given workspace type
 * @param type - The workspace type
 * @returns The absolute path to the workspace directory
 */
export function getWorkspacePath(type: WorkspaceType): string {
  if (type === WorkspaceType.NONE) {
    return "";
  }
  return path.join(getSessionTempDir(), type);
}

/**
 * Create a plain workspace folder without git initialization
 */
export async function createPlainWorkspace(): Promise<string> {
  const workspaceDir = getWorkspacePath(WorkspaceType.PLAIN);
  await fs.mkdir(workspaceDir, { recursive: true });
  await fs.writeFile(path.join(workspaceDir, "README.md"), "# Plain Folder");
  console.log(`[Workspace Setup] Created plain workspace at: ${workspaceDir}`);
  return workspaceDir;
}

/**
 * Create a git repository workspace with initial commit
 */
export async function createGitRepoWorkspace(): Promise<string> {
  const workspaceDir = getWorkspacePath(WorkspaceType.GIT_REPO);
  await fs.mkdir(workspaceDir, { recursive: true });

  await execAsync("git init", { cwd: workspaceDir });
  await execAsync('git config user.email "test@example.com"', {
    cwd: workspaceDir,
  });
  await execAsync('git config user.name "Test User"', { cwd: workspaceDir });
  await fs.writeFile(path.join(workspaceDir, "README.md"), "# Git Repo");
  await execAsync("git add .", { cwd: workspaceDir });
  await execAsync('git commit -m "Initial commit"', { cwd: workspaceDir });

  console.log(
    `[Workspace Setup] Created git-repo workspace at: ${workspaceDir}`,
  );
  return workspaceDir;
}

/**
 * Create a git repository workspace with worktrees
 * Returns the path to the main worktree
 */
export async function createGitWorktreesWorkspace(): Promise<string> {
  const mainDir = getWorkspacePath(WorkspaceType.GIT_WORKTREES);
  await fs.mkdir(mainDir, { recursive: true });

  // Initialize main repo
  await execAsync("git init", { cwd: mainDir });
  await execAsync('git config user.email "test@example.com"', { cwd: mainDir });
  await execAsync('git config user.name "Test User"', { cwd: mainDir });
  await fs.writeFile(path.join(mainDir, "README.md"), "# Main Repo");
  await execAsync("git add .", { cwd: mainDir });
  await execAsync('git commit -m "Initial commit"', { cwd: mainDir });

  // Create a worktree in a sibling directory with a new branch
  const wtDir = path.join(getSessionTempDir(), "git-worktree-linked");
  await execAsync(`git worktree add ${wtDir} -b worktree-branch`, {
    cwd: mainDir,
  });

  console.log(
    `[Workspace Setup] Created git-worktrees workspace at: ${mainDir}`,
  );
  return mainDir;
}

/**
 * Create all workspaces needed for tests
 * Called from wdio.conf.ts onPrepare hook
 */
export async function createAllWorkspaces(): Promise<void> {
  console.log("[Workspace Setup] Creating all workspaces...");

  await Promise.all([
    createPlainWorkspace(),
    createGitRepoWorkspace(),
    createGitWorktreesWorkspace(),
  ]);

  console.log("[Workspace Setup] All workspaces created successfully.");
}

/**
 * Clean up a workspace directory
 */
export async function cleanupWorkspace(workspacePath: string): Promise<void> {
  try {
    await fs.access(workspacePath);
    console.log(`[Workspace Setup] Cleaning up workspace: ${workspacePath}`);
    await fs.rm(workspacePath, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist, nothing to clean up
  }
}

/**
 * Clean up all test workspaces for the current session
 * Called from wdio.conf.ts onComplete hook
 */
export async function cleanupAllWorkspaces(): Promise<void> {
  const sessionDir = getSessionTempDir();
  try {
    await fs.access(sessionDir);
    console.log(
      `[Workspace Setup] Cleaning up all workspaces in: ${sessionDir}`,
    );
    await fs.rm(sessionDir, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist, nothing to clean up
  }
}
