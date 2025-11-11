// biome-ignore lint/style/useImportType: needed for dependency injection
import { GitStateMonitor } from "@/integrations/git/git-state";
import { getLogger } from "@/lib/logger";
import { toErrorMessage } from "@getpochi/common";
import type { GitWorktree } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import simpleGit from "simple-git";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

const logger = getLogger("WorktreeManager");

@singleton()
@injectable()
export class WorktreeManager implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  worktrees = signal<GitWorktree[]>([]);

  private git: ReturnType<typeof simpleGit>;

  constructor(private readonly gitStateMonitor: GitStateMonitor) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    this.git = simpleGit(workspaceFolder);
    this.init();
  }

  private async init() {
    if (!(await this.isGitRepository())) {
      return;
    }
    const worktrees = await this.getWorktrees();
    this.worktrees.value = worktrees;
    logger.info(
      `Initialized WorktreeManager with ${worktrees.length} worktrees.`,
    );
    const onWorktreeChanged = async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const updatedWorktrees = await this.getWorktrees();
      logger.info(`Worktrees updated to ${updatedWorktrees.length} worktrees.`);
      this.worktrees.value = updatedWorktrees;
    };
    this.disposables.push(
      this.gitStateMonitor.onDidRepositoryChange(onWorktreeChanged),
      this.gitStateMonitor.onDidChangeGitState(onWorktreeChanged),
    );
  }

  async isGitRepository(): Promise<boolean> {
    try {
      const isRepo = await this.git.checkIsRepo();
      return isRepo;
    } catch (error) {
      logger.error(
        `Failed to check if directory is a Git repository: ${toErrorMessage(error)}`,
      );
      return false;
    }
  }

  async createWorktree(): Promise<GitWorktree | null> {
    if ((await this.isGitRepository()) === false) {
      return null;
    }
    const worktrees = await this.getWorktrees();
    await vscode.commands.executeCommand("git.createWorktree");

    // Get worktrees again to find the new one
    const updatedWorktrees = await this.getWorktrees();
    // Find the new worktree by comparing with previous worktrees
    const newWorktree = updatedWorktrees.find(
      (updated) =>
        !worktrees.some((original) => original.path === updated.path),
    );
    if (newWorktree) {
      setupWorktree(newWorktree.path);
      return newWorktree;
    }
    return null;
  }

  async getWorktrees(): Promise<GitWorktree[]> {
    try {
      const result = await this.git.raw(["worktree", "list", "--porcelain"]);
      return this.parseWorktreePorcelain(result);
    } catch (error) {
      logger.error(`Failed to get worktrees: ${toErrorMessage(error)}`);
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

  dispose() {
    // @ts-ignore
    this.git = undefined;
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

/**
 * execute init.sh in *nix system or init.ps1 in windows to setup worktree
 */
export async function setupWorktree(worktree: string): Promise<boolean> {
  const isWindows = process.platform === "win32";
  const initScript = isWindows ? ".pochi/init.ps1" : ".pochi/init.sh";

  // Check if script exists
  const scriptUri = vscode.Uri.joinPath(vscode.Uri.file(worktree), initScript);
  const isFileExists = await vscode.workspace.fs.stat(scriptUri).then(
    () => true,
    () => false,
  );
  if (!isFileExists) {
    logger.debug(`Init script not found: ${initScript}`);
    return false;
  }

  try {
    const terminal = vscode.window.createTerminal({
      name: "Setup Pochi Worktree",
      cwd: worktree,
    });

    // Use proper shell execution
    const command = isWindows
      ? `powershell -ExecutionPolicy Bypass -File ./${initScript}`
      : `sh ./${initScript}`;

    terminal.sendText(command);
    terminal.show(true);

    logger.info(`Worktree setup initiated for: ${worktree}`);
    return true;
  } catch (error) {
    logger.error("Failed to setup worktree:", error);
    vscode.window.showErrorMessage(
      `Failed to setup worktree: ${toErrorMessage(error)}`,
    );
    return false;
  }
}
