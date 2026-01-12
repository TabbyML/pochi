import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { browser } from "@wdio/globals";
import type { Workbench } from "wdio-vscode-service";
import { runCommonTests } from "./common";

const TEMP_DIR = path.join(os.tmpdir(), "pochi-test-workspaces");

function setupWorkspaces() {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEMP_DIR, { recursive: true });

  // 1. Plain folder
  const plainDir = path.join(TEMP_DIR, "plain-folder");
  fs.mkdirSync(plainDir);
  fs.writeFileSync(path.join(plainDir, "README.md"), "# Plain Folder");

  // 2. Git repo (main worktree)
  const gitRepoDir = path.join(TEMP_DIR, "git-repo");
  fs.mkdirSync(gitRepoDir);
  execSync("git init", { cwd: gitRepoDir });
  execSync('git config user.email "test@example.com"', { cwd: gitRepoDir });
  execSync('git config user.name "Test User"', { cwd: gitRepoDir });
  fs.writeFileSync(path.join(gitRepoDir, "README.md"), "# Git Repo");
  execSync("git add .", { cwd: gitRepoDir });
  execSync('git commit -m "Initial commit"', { cwd: gitRepoDir });

  // 3. Git repo with worktrees (opening main)
  const gitMainWithWtDir = path.join(TEMP_DIR, "git-main-with-wt");
  fs.mkdirSync(gitMainWithWtDir);
  execSync("git init", { cwd: gitMainWithWtDir });
  execSync('git config user.email "test@example.com"', {
    cwd: gitMainWithWtDir,
  });
  execSync('git config user.name "Test User"', { cwd: gitMainWithWtDir });
  fs.writeFileSync(path.join(gitMainWithWtDir, "README.md"), "# Main Repo");
  execSync("git add .", { cwd: gitMainWithWtDir });
  execSync('git commit -m "Initial commit"', { cwd: gitMainWithWtDir });

  // Create a worktree
  const wtDir = path.join(TEMP_DIR, "git-wt-linked");
  execSync(`git worktree add ${wtDir}`, { cwd: gitMainWithWtDir });

  return {
    plainDir,
    gitRepoDir,
    gitMainWithWtDir,
  };
}

describe("Workspace Configurations", () => {
  let workbench: Workbench;
  let workspaces: ReturnType<typeof setupWorkspaces>;

  before(async () => {
    workspaces = setupWorkspaces();
    workbench = await browser.getWorkbench();
  });

  // after(async () => {
  //     if (fs.existsSync(TEMP_DIR)) {
  //         fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  //     }
  // });

  async function openWorkspace(folderPath: string) {
    console.log(`[Test Debug] Opening workspace: ${folderPath}`);
    const initialHandles = await browser.getWindowHandles();
    await browser.executeWorkbench(async (vscode, folderPath) => {
      const uri = vscode.Uri.file(folderPath);
      await vscode.commands.executeCommand("vscode.openFolder", uri, {
        forceNewWindow: true,
      });
    }, folderPath);

    await browser.waitUntil(
      async () => {
        const handles = await browser.getWindowHandles();
        return handles.length > initialHandles.length;
      },
      { timeout: 10000, timeoutMsg: "New window did not open" },
    );

    const handles = await browser.getWindowHandles();
    const newWindowHandle = handles.find((h) => !initialHandles.includes(h));
    if (newWindowHandle) {
      await browser.switchToWindow(newWindowHandle);
    }

    // Give it some time to start reloading
    await browser.pause(2000);

    // Wait for the workbench to reload and title to contain folder name
    const folderName = path.basename(folderPath);
    console.log(`[Test Debug] Waiting for workspace ${folderName} to load...`);
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

    console.log("[Test Debug] Workspace loaded. Initializing workbench...");
    workbench = await browser.getWorkbench();

    // Open a new text file to ensure we have an active tab using UI interaction
    console.log("[Test Debug] Executing File: New Text File...");
    await workbench.executeCommand("File: New Text File");
    console.log("[Test Debug] Command executed. Waiting for tab...");
    await browser.pause(2000);
  }

  describe("no workspace opened", () => {
    // No setup needed as default state has no workspace
    before(async () => {
      // Wait for initial load
      await browser.pause(5000);
    });
    runCommonTests(() => browser.getWorkbench(), { skipTaskCreation: true });
  });

  describe("plain folder (no git)", () => {
    before(async () => {
      await openWorkspace(workspaces.plainDir);
    });
    runCommonTests(() => browser.getWorkbench());
  });

  describe("git repo (main worktree)", () => {
    before(async () => {
      await openWorkspace(workspaces.gitRepoDir);
    });
    runCommonTests(() => browser.getWorkbench());
  });

  describe("git repo having worktrees", () => {
    before(async () => {
      await openWorkspace(workspaces.gitMainWithWtDir);
    });
    runCommonTests(() => browser.getWorkbench());
  });
});
