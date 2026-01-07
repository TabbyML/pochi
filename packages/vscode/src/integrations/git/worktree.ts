import path from "node:path";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { GitState } from "@/integrations/git/git-state";
import { Deferred } from "@/lib/defered";
import { readFileContent } from "@/lib/fs";
import { generateBranchName } from "@/lib/generate-branch-name";
import { getLogger } from "@/lib/logger";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceScope } from "@/lib/workspace-scoped";
import { toErrorMessage } from "@getpochi/common";
import { getWorktreeNameFromWorktreePath } from "@getpochi/common/git-utils";
import { isPlainText } from "@getpochi/common/tool-utils";
import type {
  CreateWorktreeOptions,
  GitWorktree,
} from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import simpleGit from "simple-git";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "../configuration";
import {
  type FileChange,
  showDiffChanges,
} from "../editor/diff-changes-editor";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { GitWorktreeInfoProvider } from "./git-worktree-info-provider";

const logger = getLogger("WorktreeManager");

@singleton()
@injectable()
export class WorktreeManager implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  worktrees = signal<GitWorktree[]>([]);
  inited = new Deferred<void>();

  private workspacePath: string | undefined;
  private git: ReturnType<typeof simpleGit>;

  get maxWorktrees() {
    return this.pochiConfiguration.detectWorktreesLimit.value;
  }

  constructor(
    private readonly workspaceScope: WorkspaceScope,
    private readonly gitState: GitState,
    private readonly worktreeInfoProvider: GitWorktreeInfoProvider,
    private readonly pochiConfiguration: PochiConfiguration,
  ) {
    this.workspacePath = this.workspaceScope.workspacePath;
    this.git = simpleGit(this.workspacePath);
    this.init();
  }

  public getWorktreeDisplayName(cwd: string): string | undefined {
    const worktree = this.worktrees.value.find((wt) => wt.path === cwd);
    if (!worktree) {
      if (this.workspacePath && cwd === this.workspacePath) {
        return "workspace";
      }
      return getWorktreeNameFromWorktreePath(cwd);
    }
    return worktree.isMain ? "workspace" : getWorktreeNameFromWorktreePath(cwd);
  }

  private async setupWatcher() {
    if (!this.workspacePath) {
      return;
    }
    try {
      const commonGitDir = (
        await this.git.revparse(["--git-common-dir"])
      ).trim();
      const absoluteCommonGitDir = path.isAbsolute(commonGitDir)
        ? commonGitDir
        : path.resolve(this.workspacePath, commonGitDir);

      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(
          vscode.Uri.file(absoluteCommonGitDir),
          "worktrees/**",
        ),
      );

      this.disposables.push(watcher);

      this.disposables.push(
        watcher.onDidCreate(async (uri) => {
          if (path.basename(uri.fsPath) === "gitdir") {
            try {
              const content = await readFileContent(uri.fsPath);
              if (content) {
                const worktreePath = path.dirname(content.trim());
                logger.debug(`worktree added: ${worktreePath}`);
                this.updateWorktrees(worktreePath);
              }
            } catch (e) {
              logger.error(`Failed to handle worktree creation: ${e}`);
            }
          }
        }),
      );

      this.disposables.push(
        watcher.onDidDelete((uri) => {
          const relativePath = path.relative(absoluteCommonGitDir, uri.fsPath);
          const parts = relativePath.split(path.sep);
          if (parts.length === 2 && parts[0] === "worktrees") {
            logger.debug(`worktree deleted: ${uri.fsPath}`);
            this.updateWorktrees();
          }
        }),
      );
    } catch (e) {
      logger.error(`Failed to setup worktree watcher: ${toErrorMessage(e)}`);
    }
  }

  private async init() {
    if (!(await this.isGitRepository())) {
      this.inited.resolve();
      return;
    }
    logger.info("init worktree manager");
    await this.updateWorktrees();
    await this.setupWatcher();
    await this.gitState.inited.promise;

    this.disposables.push(
      this.gitState.onDidChangeBranch((e) => {
        if (e.type === "branch-changed") {
          this.worktrees.value = this.worktrees.value.map((wt) => {
            if (wt.path === e.repository) {
              return { ...wt, branch: e.currentBranch };
            }
            return wt;
          });
        }
      }),
    );
    this.inited.resolve();
  }

  getMainWorktree() {
    return this.worktrees.value.find((wt) => wt.isMain);
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

  async createWorktree(
    options?: CreateWorktreeOptions,
  ): Promise<GitWorktree | null> {
    if ((await this.isGitRepository()) === false) {
      return null;
    }
    const worktrees = [...this.worktrees.value];

    if (worktrees.length >= this.maxWorktrees) {
      vscode.window.showErrorMessage(
        `Cannot create more than ${this.maxWorktrees} worktrees.`,
      );
      return null;
    }

    if (options?.generateBranchName) {
      // Generate branch name and create worktree
      const workspacePath = this.workspacePath;
      if (!workspacePath) {
        logger.debug(
          "Failed to create worktree due to cannot find workspacePath.",
        );
        return null;
      }
      const { worktreePath, branchName } =
        await this.prepareBranchNameAndWorktreePath({
          workspacePath,
          worktrees,
          prompt: options.generateBranchName.prompt,
          files: options.generateBranchName.files,
        });

      await this.createWorktreeImpl({
        worktreePath,
        branchName,
        workspacePath,
        commitish: options?.baseBranch ?? "HEAD",
      });
    } else {
      // User interactive
      await vscode.commands.executeCommand("git.createWorktree");
    }

    // Get worktrees again to find the new one
    const updatedWorktrees = await this.getWorktrees();
    // Find the new worktree by comparing with previous worktrees
    const newWorktree: GitWorktree | undefined = updatedWorktrees.findLast(
      (updated) =>
        !worktrees.some((original) => original.path === updated.path),
    );
    if (newWorktree) {
      logger.debug(`New worktree created at: ${newWorktree.path}`);
      this.updateWorktrees(newWorktree.path);
      setupWorktree(newWorktree.path);
      return newWorktree;
    }
    return null;
  }

  async deleteWorktree(worktreePath: string): Promise<boolean> {
    if ((await this.isGitRepository()) === false) {
      return false;
    }

    const worktree = this.worktrees.value.find(
      (wt) => wt.path === worktreePath,
    );
    if (!worktree) {
      vscode.window.showErrorMessage(`Worktree not found: ${worktreePath}`);
      return false;
    }

    if (worktree.isMain) {
      vscode.window.showErrorMessage("Cannot delete the workspace.");
      return false;
    }

    try {
      await this.git.raw(["worktree", "remove", "--force", worktreePath]);
      this.worktreeInfoProvider.delete(worktreePath);
      return true;
    } catch (error) {
      logger.error(`Failed to delete worktree: ${toErrorMessage(error)}`);
      vscode.window.showErrorMessage(
        `Failed to delete worktree: ${toErrorMessage(error)}`,
      );
    }

    return false;
  }

  async showWorktreeDiff(cwd: string) {
    const baseBranch = await this.getDefaultBranch();
    await showWorktreeDiff(cwd, baseBranch);
  }

  private async updateWorktrees(added?: string) {
    const originalPaths = this.worktrees.value.map((wt) => wt.path);
    let worktrees = await this.getWorktrees();

    // if added new worktree, make sure it is placed at the end
    if (
      added &&
      !this.worktrees.value.some((wt) => wt.path === added) &&
      this.worktrees.value.length < this.maxWorktrees
    ) {
      const addedWorktree = worktrees.find((wt) => wt.path === added);
      const otherWorktrees = worktrees.filter((wt) => wt.path !== added);
      worktrees = addedWorktree
        ? [...otherWorktrees, addedWorktree]
        : otherWorktrees;
    }

    // keep worktree order same as before update
    worktrees.sort((a, b) => {
      // Keep the added one at the end if it was just added
      if (added) {
        if (a.path === added) return 1;
        if (b.path === added) return -1;
      }

      const indexA = originalPaths.indexOf(a.path);
      const indexB = originalPaths.indexOf(b.path);

      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      if (indexA !== -1) {
        return -1;
      }
      if (indexB !== -1) {
        return 1;
      }
      return 0;
    });

    this.worktrees.value = worktrees;

    logger.debug(
      `Updating worktrees to ${this.worktrees.value.length} worktrees`,
    );
  }

  private async getWorktrees(): Promise<GitWorktree[]> {
    try {
      const result = await this.git.raw(["worktree", "list", "--porcelain"]);
      const worktrees = this.parseWorktreePorcelain(result)
        .filter((wt) => wt.prunable === undefined)
        .map<GitWorktree>((wt) => {
          const storedData = this.worktreeInfoProvider.get(wt.path);
          return { ...wt, data: storedData };
        })
        .slice(0, this.maxWorktrees);

      const workspaceWorktree = worktrees.find(
        (x) => x.path === this.workspacePath,
      );
      if (workspaceWorktree && !workspaceWorktree.isMain) {
        // If the current workspace is a non-main worktree, only return the current worktree
        return [workspaceWorktree];
      }

      return worktrees;
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
      } else if (line.startsWith("prunable ")) {
        // Prunable worktree with reason
        currentWorktree.prunable = line.substring("prunable ".length);
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

  private async getDefaultBranch() {
    try {
      const ref = await this.git.raw([
        "symbolic-ref",
        "refs/remotes/origin/HEAD",
      ]);
      const match = ref.match(/^refs\/remotes\/origin\/(.+)$/);
      if (match) {
        return match[1];
      }
      return "origin/main";
    } catch (error) {
      logger.error(`Failed to get default branch: ${toErrorMessage(error)}`);
      return "origin/main";
    }
  }

  private async getBranches() {
    const { all } = await this.git.branch();
    return all;
  }

  async getOriginUrl(): Promise<string | null> {
    try {
      const url = await this.git.raw(["config", "--get", "remote.origin.url"]);
      return url.trim();
    } catch (error) {
      logger.error(`Failed to get origin URL: ${toErrorMessage(error)}`);
      return null;
    }
  }

  private async prepareBranchNameAndWorktreePath(params: {
    workspacePath: string;
    worktrees: GitWorktree[];
    prompt: NonNullable<CreateWorktreeOptions["generateBranchName"]>["prompt"];
    files?: NonNullable<CreateWorktreeOptions["generateBranchName"]>["files"];
  }) {
    const { workspacePath, worktrees, prompt, files } = params;
    const existingBranches = await this.getBranches();
    let branchName: string | undefined = undefined;
    try {
      // Generate branch name
      branchName = await generateBranchName({
        prompt,
        files,
        existingBranches,
      });
    } catch (e) {
      logger.debug("Failed to generate branch name", e);
    }
    const getTimestampString = () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = (now.getMonth() + 1).toString().padStart(2, "0");
      const day = now.getDate().toString().padStart(2, "0");
      const hours = now.getHours().toString().padStart(2, "0");
      const minutes = now.getMinutes().toString().padStart(2, "0");
      const seconds = now.getSeconds().toString().padStart(2, "0");
      return `${year}${month}${day}-${hours}${minutes}${seconds}`;
    };
    if (branchName && existingBranches.includes(branchName)) {
      // Branch name exists
      branchName = `${branchName}-${getTimestampString()}`;
    }
    if (!branchName) {
      // Fallback to timestamp
      branchName = `worktree/${getTimestampString()}`;
    }

    const worktreeName = branchName.replace(/\//g, "-");
    const nonMainWorktree = worktrees.find((w) => !w.isMain);
    const worktreeParentPath = nonMainWorktree
      ? path.dirname(nonMainWorktree.path)
      : `${workspacePath.replace(/[/\\]+$/, "")}.worktree`;

    return {
      branchName,
      worktreePath: path.join(worktreeParentPath, worktreeName),
    };
  }

  private async createWorktreeImpl(params: {
    workspacePath: string;
    worktreePath: string;
    branchName: string;
    commitish: string;
  }) {
    const { workspacePath, worktreePath, branchName, commitish } = params;
    const repository = this.gitState.getRepository(workspacePath);

    if (
      repository &&
      "createWorktree" in repository &&
      typeof repository.createWorktree === "function"
    ) {
      // Use vscode git extension api
      try {
        await repository.createWorktree({
          path: worktreePath,
          branch: branchName,
          commitish,
        });
        logger.debug(`Created worktree ${branchName}`);
      } catch (e) {
        logger.debug("Failed to create worktree", e);
        return null;
      }
    } else {
      // Use git command
      try {
        await this.git.raw([
          "worktree",
          "add",
          "-b",
          branchName,
          worktreePath,
          commitish,
        ]);
        logger.debug(`Created worktree ${branchName} using raw command`);
      } catch (e) {
        logger.debug("Failed to create worktree using raw command", e);
        return null;
      }
    }
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

    logger.debug(`Worktree setup initiated for: ${worktree}`);
    return true;
  } catch (error) {
    logger.error("Failed to setup worktree:", error);
    vscode.window.showErrorMessage(
      `Failed to setup worktree: ${toErrorMessage(error)}`,
    );
    return false;
  }
}

async function showWorktreeDiff(
  cwd: string,
  base = "origin/main",
): Promise<boolean> {
  if (!cwd) {
    return false;
  }

  const git = simpleGit(cwd);
  const result: FileChange[] = [];
  try {
    const output = await git.raw(["diff", "--name-status", base]);
    if (output.trim().length === 0) {
      vscode.window.showInformationMessage("No changes found.");
      return false;
    }
    const changedFiles = output
      .trim()
      .split("\n")
      .map((line: string) => {
        const [status, filepath] = line.split("\t");
        return { status: status.trim(), filepath: filepath.trim() };
      });

    if (changedFiles.length === 0) {
      vscode.window.showInformationMessage("No changes found.");
      return false;
    }

    const isFileExistInBase = (filepath: string) =>
      git.raw(["ls-tree", "-r", base, "--", filepath]).then(
        (res) => res.trim().length > 0,
        () => false,
      );

    for (const { status, filepath } of changedFiles) {
      const fsPath = path.join(cwd, filepath);
      let beforeContent = "";
      let afterContent = "";
      if (status === "A") {
        afterContent = (await readFileContent(fsPath)) ?? "";
      } else if (status === "D") {
        if (await isFileExistInBase(filepath)) {
          beforeContent = await git.raw(["show", `${base}:${filepath}`]);
        }
      } else if (status === "M") {
        if (await isFileExistInBase(filepath)) {
          beforeContent = await git.raw(["show", `${base}:${filepath}`]);
        }
        afterContent = (await readFileContent(fsPath)) ?? "";
      }

      if (
        !isPlainText(Buffer.from(beforeContent)) ||
        !isPlainText(Buffer.from(afterContent))
      ) {
        continue;
      }

      result.push({
        filepath,
        before: beforeContent,
        after: afterContent,
      });
    }

    // Workaround: Focus the target column before calling 'vscode.changes'
    const dummyDoc = await vscode.workspace.openTextDocument({
      content: "",
      language: "text",
    });
    await vscode.window.showTextDocument(dummyDoc, {
      preview: true,
      preserveFocus: false,
    });

    // show changes
    const worktreeName = path.basename(cwd);
    const title = `Changes: ${base} ↔ ${worktreeName}`;
    return await showDiffChanges(result, title, cwd, true);
  } catch (e: unknown) {
    vscode.window.showErrorMessage(`Failed to get diff: ${toErrorMessage(e)}`);
    return false;
  }
}
