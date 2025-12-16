import path from "node:path";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { GitState } from "@/integrations/git/git-state";
import { Deferred } from "@/lib/defered";
import { readFileContent } from "@/lib/fs";
import { generateBranchName } from "@/lib/generate-branch-name";
import { getLogger } from "@/lib/logger";
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
import { DiffChangesContentProvider } from "../editor/diff-changes-content-provider";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { GitWorktreeInfoProvider } from "./git-worktree-info-provider";

const logger = getLogger("WorktreeManager");

@singleton()
@injectable()
export class WorktreeManager implements vscode.Disposable {
  private maxWorktrees = 10;
  private readonly disposables: vscode.Disposable[] = [];
  worktrees = signal<GitWorktree[]>([]);
  inited = new Deferred<void>();

  defaultBranch = "origin/main";

  private workspacePath: string | undefined;
  private git: ReturnType<typeof simpleGit>;

  constructor(
    private readonly gitState: GitState,
    private readonly worktreeInfoProvider: GitWorktreeInfoProvider,
  ) {
    const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    this.workspacePath = workspacePath;
    this.git = simpleGit(workspacePath);
    this.init();
  }

  public getWorktreeDisplayName(cwd: string): string | undefined {
    const worktree = this.worktrees.value.find((wt) => wt.path === cwd);
    if (!worktree) {
      return getWorktreeNameFromWorktreePath(cwd);
    }
    return worktree.isMain ? "workspace" : getWorktreeNameFromWorktreePath(cwd);
  }

  private async init() {
    if (!(await this.isGitRepository())) {
      return;
    }
    await this.gitState.inited.promise;
    await this.updateWorktrees();
    const onWorktreeChanged = async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await this.updateWorktrees();
    };
    this.disposables.push(
      this.gitState.onDidChangeRepository(onWorktreeChanged),
    );
    this.defaultBranch = await this.getDefaultBranch();
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
    const worktrees = await this.getWorktrees();

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
        commitish: "HEAD",
      });
    } else {
      // User interactive
      await vscode.commands.executeCommand("git.createWorktree");
    }

    // Get worktrees again to find the new one
    const updatedWorktrees = await this.getWorktrees(true);
    // Find the new worktree by comparing with previous worktrees
    const newWorktree: GitWorktree | undefined = updatedWorktrees.findLast(
      (updated) =>
        !worktrees.some((original) => original.path === updated.path),
    );
    if (newWorktree) {
      logger.debug(`New worktree created at: ${newWorktree.path}`);
      this.updateWorktrees();
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
    await showWorktreeDiff(cwd, this.defaultBranch);
  }

  async updateWorktrees() {
    this.worktrees.value = await this.getWorktrees();
    logger.debug(
      `Updating worktrees to ${this.worktrees.value.length} worktrees`,
    );
  }

  async getWorktrees(skipVSCodeFilter?: boolean): Promise<GitWorktree[]> {
    try {
      const result = await this.git.raw(["worktree", "list", "--porcelain"]);
      const worktrees = this.parseWorktreePorcelain(result)
        .filter((wt) => wt.prunable === undefined)
        .map<GitWorktree>((wt) => {
          const storedData = this.worktreeInfoProvider.get(wt.path);
          return { ...wt, data: storedData };
        });
      if (skipVSCodeFilter) return worktrees;

      const vscodeRepos = this.gitState.repositories.map(
        (uri) => vscode.Uri.parse(uri).fsPath,
      );
      logger.info(`VSCode Repositories: ${vscodeRepos}`);
      // keep the worktree order and number same as vscode
      return vscodeRepos
        .map((repoPath) => worktrees.find((wt) => wt.path === repoPath))
        .filter((wt): wt is GitWorktree => wt !== undefined);
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
      branchName = `branch/${getTimestampString()}`;
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
  const result: { filepath: string; before: string; after: string }[] = [];
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

    await vscode.commands.executeCommand(
      "vscode.changes",
      title,
      result.map((file) => [
        vscode.Uri.joinPath(vscode.Uri.file(cwd), file.filepath),
        DiffChangesContentProvider.decode({
          filepath: file.filepath,
          content: file.before,
          cwd,
        }),
        DiffChangesContentProvider.decode({
          filepath: file.filepath,
          content: file.after,
          cwd,
        }),
      ]),
    );
    return true;
  } catch (e: unknown) {
    vscode.window.showErrorMessage(`Failed to get diff: ${toErrorMessage(e)}`);
    return false;
  }
}
