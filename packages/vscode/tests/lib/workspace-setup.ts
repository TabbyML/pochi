import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { browser } from "@wdio/globals";

const TEMP_DIR = path.join(os.tmpdir(), "pochi-test-workspaces");

/**
 * Create a plain workspace folder without git initialization
 */
export async function createPlainWorkspace(): Promise<string> {
  const workspaceDir = path.join(TEMP_DIR, `plain-${Date.now()}`);
  fs.mkdirSync(workspaceDir, { recursive: true });
  fs.writeFileSync(path.join(workspaceDir, "README.md"), "# Plain Folder");
  return workspaceDir;
}

/**
 * Create a git repository workspace with initial commit
 */
export async function createGitRepoWorkspace(): Promise<string> {
  const workspaceDir = path.join(TEMP_DIR, `git-repo-${Date.now()}`);
  fs.mkdirSync(workspaceDir, { recursive: true });

  execSync("git init", { cwd: workspaceDir });
  execSync('git config user.email "test@example.com"', { cwd: workspaceDir });
  execSync('git config user.name "Test User"', { cwd: workspaceDir });
  fs.writeFileSync(path.join(workspaceDir, "README.md"), "# Git Repo");
  execSync("git add .", { cwd: workspaceDir });
  execSync('git commit -m "Initial commit"', { cwd: workspaceDir });

  return workspaceDir;
}

/**
 * Create a git repository workspace with worktrees
 * Returns the path to the main worktree
 */
export async function createGitWorktreesWorkspace(): Promise<string> {
  const mainDir = path.join(TEMP_DIR, `git-main-with-wt-${Date.now()}`);
  fs.mkdirSync(mainDir, { recursive: true });

  // Initialize main repo
  execSync("git init", { cwd: mainDir });
  execSync('git config user.email "test@example.com"', { cwd: mainDir });
  execSync('git config user.name "Test User"', { cwd: mainDir });
  fs.writeFileSync(path.join(mainDir, "README.md"), "# Main Repo");
  execSync("git add .", { cwd: mainDir });
  execSync('git commit -m "Initial commit"', { cwd: mainDir });

  // Create a worktree
  const wtDir = path.join(TEMP_DIR, `git-wt-linked-${Date.now()}`);
  execSync(`git worktree add ${wtDir}`, { cwd: mainDir });

  return mainDir;
}

/**
 * Open a workspace folder in VSCode
 * Handles window switching and waits for workspace to load
 */
export async function openWorkspace(folderPath: string): Promise<void> {
  console.log(`[Workspace Setup] Opening workspace: ${folderPath}`);

  const initialHandles = await browser.getWindowHandles();

  // Open the folder in a new window
  await browser.executeWorkbench(async (vscode, folderPath) => {
    const uri = vscode.Uri.file(folderPath);
    await vscode.commands.executeCommand("vscode.openFolder", uri, {
      forceNewWindow: true,
    });
  }, folderPath);

  // Wait for new window to open
  await browser.waitUntil(
    async () => {
      const handles = await browser.getWindowHandles();
      return handles.length > initialHandles.length;
    },
    { timeout: 10000, timeoutMsg: "New window did not open" },
  );

  // Switch to the new window
  const handles = await browser.getWindowHandles();
  const newWindowHandle = handles.find((h) => !initialHandles.includes(h));
  if (newWindowHandle) {
    await browser.switchToWindow(newWindowHandle);
  }

  // Wait for VSCode to start reloading
  await browser.pause(2000);

  // Wait for workspace to load and title to contain folder name
  const folderName = path.basename(folderPath);
  console.log(
    `[Workspace Setup] Waiting for workspace ${folderName} to load...`,
  );

  await browser.waitUntil(
    async () => {
      try {
        const title = await browser.getTitle();
        return title.includes(folderName);
      } catch (e) {
        return false;
      }
    },
    { timeout: 20000, timeoutMsg: `Workspace ${folderName} did not load` },
  );

  console.log("[Workspace Setup] Workspace loaded successfully.");
}

/**
 * Clean up a workspace directory
 */
export async function cleanupWorkspace(workspacePath: string): Promise<void> {
  if (fs.existsSync(workspacePath)) {
    console.log(`[Workspace Setup] Cleaning up workspace: ${workspacePath}`);
    fs.rmSync(workspacePath, { recursive: true, force: true });
  }
}

/**
 * Clean up all test workspaces
 */
export async function cleanupAllWorkspaces(): Promise<void> {
  if (fs.existsSync(TEMP_DIR)) {
    console.log(`[Workspace Setup] Cleaning up all workspaces in: ${TEMP_DIR}`);
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
}
