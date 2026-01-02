import * as crypto from "node:crypto";
import { mkdir } from "node:fs/promises";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Deferred } from "@/lib/defered";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceScope } from "@/lib/workspace-scoped";
import { getLogger, toErrorMessage } from "@getpochi/common";
import type {
  DiffCheckpointOptions,
  FileDiff,
  SaveCheckpointOptions,
  TaskChangedFile,
} from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { Lifecycle, inject, injectable, scoped } from "tsyringe";
import type * as vscode from "vscode";
import type { FileChange } from "../editor/diff-changes-editor";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorktreeManager } from "../git/worktree";
import { ShadowGitRepo } from "./shadow-git-repo";
import { filterGitChanges, processGitChangesToFileEdits } from "./util";

const logger = getLogger("CheckpointService");

const checkpointCommitPrefix = (cwd: string) => `checkpoint-${cwd}-msg-`;

const getPathId = (filePath: string) => {
  return crypto
    .createHash("sha256")
    .update(path.normalize(filePath))
    .digest("hex")
    .substring(0, 32); // First 32 chars of SHA-256
};

@scoped(Lifecycle.ContainerScoped)
@injectable()
export class CheckpointService implements vscode.Disposable {
  private shadowGit: ShadowGitRepo | undefined;
  private readyDefer = new Deferred<void>();
  private initialized = false;

  latestCheckpoint = signal<string | null>(null);

  constructor(
    private readonly workspaceScope: WorkspaceScope,
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
    private readonly worktreeManager: WorktreeManager,
  ) {}

  private get cwd() {
    if (!this.workspaceScope.cwd) {
      throw new Error("No workspace folder found. Please open a workspace.");
    }
    return this.workspaceScope.cwd;
  }

  /**
   * Lazy initializes the checkpoint service.
   * @returns A promise that resolves when the checkpoint service is initialized.
   */
  async ensureInitialized() {
    if (!this.initialized) {
      this.initialized = true;
      await this.init();
    }
    return this.readyDefer.promise;
  }

  private async init() {
    try {
      const gitPath = await this.getShadowGitPath();
      this.shadowGit = await ShadowGitRepo.getOrCreate(gitPath, this.cwd);
      logger.trace("Shadow Git repository initialized at", gitPath);
      this.latestCheckpoint.value = await this.shadowGit.getLatestCommitHash(
        checkpointCommitPrefix(this.cwd),
      );
      this.readyDefer.resolve();
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error("Failed to initialize Shadow Git repository:", errorMessage);
      this.readyDefer.reject(
        new Error(`Failed to initialize checkpoint service: ${errorMessage}`),
      );
    }
  }

  /**
   * Saves a checkpoint for the current workspace.
   * @param message A message to associate with the checkpoint.
   * @returns The commit hash of the created checkpoint. If the repository is clean, returns undefined.
   */
  saveCheckpoint = async (
    message: string,
    options: SaveCheckpointOptions = {},
  ): Promise<string | null> => {
    logger.trace(`Saving checkpoint with message: ${message}`);

    await this.ensureInitialized();

    if (!this.shadowGit) {
      throw new Error("Shadow Git repository not initialized");
    }

    try {
      const status = await this.shadowGit.status();
      if (status.isClean && !options.force) {
        return null;
      }
      await this.shadowGit.stageAll();
      const commitMessage = `${checkpointCommitPrefix(this.cwd)}${message}`;
      const commitHash = await this.shadowGit.commit(commitMessage);
      logger.trace(
        `Successfully saved checkpoint with message: ${message}, commit hash: ${commitHash}`,
      );
      this.latestCheckpoint.value = commitHash;
      return commitHash;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      const fullErrorMessage = `Failed to save checkpoint with message: ${message}: ${errorMessage}`;
      logger.error(fullErrorMessage, { error });
      throw new Error(fullErrorMessage);
    }
  };

  /**
   * Restores a checkpoint for the current workspace.
   * @param commitHash The commit hash to restore the checkpoint from.
   * @returns A promise that resolves when the checkpoint is restored.
   */
  restoreCheckpoint = async (
    commitHash: string,
    files?: string[],
  ): Promise<void> => {
    logger.trace(`Restoring checkpoint for commit hash: ${commitHash}`);
    await this.ensureInitialized();

    if (!this.shadowGit) {
      throw new Error("Shadow Git repository not initialized");
    }

    try {
      await this.shadowGit.reset(commitHash, files);
      this.latestCheckpoint.value = commitHash;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error(
        `Failed to restore checkpoint for commit hash: ${commitHash}: ${errorMessage}`,
      );
      throw new Error(`Failed to restore checkpoint: ${errorMessage}`);
    }
  };

  restoreChangedFiles = async (files: TaskChangedFile[]): Promise<void> => {
    await this.ensureInitialized();
    if (!this.shadowGit) {
      throw new Error("Shadow Git repository not initialized");
    }

    try {
      for (const file of files) {
        if (file.content === null) {
          await fs.rm(path.join(this.cwd, file.filepath), { force: true });
        } else if (file.content?.type === "checkpoint") {
          const exists = await this.checkFileExistsInCheckpoint(
            file.content.commit,
            file.filepath,
          );
          if (exists) {
            await this.shadowGit.reset(file.content.commit, [file.filepath]);
          } else {
            await fs.rm(path.join(this.cwd, file.filepath), { force: true });
          }
        } else if (file.content?.type === "text") {
          await fs.writeFile(
            path.join(this.cwd, file.filepath),
            file.content.text,
            "utf8",
          );
        }
      }
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error(`Failed to restore changed files: ${errorMessage}`);
      throw new Error(`Failed to restore changed files: ${errorMessage}`);
    }
  };

  async getShadowGitPath() {
    if (!this.context.globalStorageUri) {
      throw new Error("Extension global storage URI is not available");
    }
    await this.worktreeManager.inited.promise;
    const workspacePath =
      this.worktreeManager.getMainWorktree()?.path ?? this.workspaceScope.cwd;
    if (!workspacePath) {
      throw new Error("Cannot get workspace path");
    }
    const storagePath = this.context.globalStorageUri.fsPath;
    const checkpointDir = path.join(
      storagePath,
      "checkpoint",
      getPathId(workspacePath),
    );
    logger.info(
      `Checkpoint directory for workspace: ${this.workspaceScope.cwd} is: ${checkpointDir}`,
    );
    await mkdir(checkpointDir, { recursive: true });
    return checkpointDir;
  }

  getCheckpointChanges = async (
    from: string,
    to?: string,
  ): Promise<FileChange[]> => {
    await this.ensureInitialized();
    if (!this.shadowGit) {
      throw new Error("Shadow Git repository not initialized");
    }
    try {
      const changes = await this.shadowGit.getDiff(from, to);
      return filterGitChanges(changes);
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error(
        `Failed to get changes for commit hash: ${from} to: ${to}: ${errorMessage}`,
        { error },
      );
      throw new Error(`Failed to get changes: ${errorMessage}`);
    }
  };

  getCheckpointFileEdits = async (
    from: string,
    files?: string[],
    options?: DiffCheckpointOptions,
  ): Promise<FileDiff[] | null> => {
    await this.ensureInitialized();
    if (!this.shadowGit) {
      throw new Error("Shadow Git repository not initialized");
    }
    try {
      await this.shadowGit.stageAll(); // Ensure all changes are staged, including untracked files
      const changes = await this.shadowGit.getDiff(from, undefined, files);
      const result = processGitChangesToFileEdits(changes, options);
      logger.debug(
        `Git diff for commit hash ${from} for files: ${files ?? "all"} ${JSON.stringify(changes)} ${JSON.stringify(result)}`,
      );
      return result;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error(
        `Failed to get user edits for commit hash: ${from}${files ? ` for files: ${files}` : ""}: ${errorMessage}`,
        { error },
      );
      return null;
    }
  };

  diffChangedFiles = async (
    changedFiles: TaskChangedFile[],
  ): Promise<TaskChangedFile[]> => {
    await this.ensureInitialized();
    if (!this.shadowGit) {
      throw new Error("Shadow Git repository not initialized");
    }

    const result: TaskChangedFile[] = [];
    for (const file of changedFiles) {
      let changes: FileChange[] = [];
      if (file.content?.type === "checkpoint") {
        changes = await this.shadowGit.getDiff(file.content.commit, undefined, [
          file.filepath,
        ]);
      } else {
        let content = null;
        if (file.content?.type === "text") {
          content = file.content.text;
        }
        let afterContent = null;
        try {
          afterContent = await fs.readFile(
            path.join(this.cwd, file.filepath),
            "utf8",
          );
        } catch (error) {}
        changes = [
          {
            filepath: file.filepath,
            before: content,
            after: afterContent,
          },
        ];
      }

      const diff = processGitChangesToFileEdits(changes);

      logger.debug(
        `update diff for changed file: ${JSON.stringify(diff)} state=${file.state}`,
      );

      if (diff && diff.length > 0) {
        const firstDiff = diff[0];
        if (firstDiff.added || firstDiff.removed || firstDiff.deleted) {
          result.push({
            ...file,
            filepath: file.filepath,
            added: firstDiff.added,
            removed: firstDiff.removed,
            deleted: firstDiff.deleted,
            state: "pending",
          });
        } else {
          result.push(file);
        }
      }
    }

    return result;
  };

  getChangedFilesChanges = async (
    changedFiles: TaskChangedFile[],
  ): Promise<FileChange[]> => {
    await this.ensureInitialized();
    if (!this.shadowGit) {
      throw new Error("Shadow Git repository not initialized");
    }

    const changes: FileChange[] = [];
    for (const file of changedFiles) {
      if (file.content?.type === "checkpoint") {
        const diffResult = await this.shadowGit.getDiff(
          file.content.commit,
          undefined,
          [file.filepath],
        );
        changes.push(diffResult[0]);
      } else {
        let content = "";
        if (file.content?.type === "text") {
          content = file.content.text;
        }
        let afterContent = null;
        try {
          afterContent = await fs.readFile(
            path.join(this.cwd, file.filepath),
            "utf8",
          );
        } catch (error) {}
        changes.push({
          filepath: file.filepath,
          before: content,
          after: afterContent,
        });
      }
    }
    return changes;
  };

  private checkFileExistsInCheckpoint = async (
    commitHash: string,
    filepath: string,
  ): Promise<boolean> => {
    await this.ensureInitialized();
    if (!this.shadowGit) {
      throw new Error("Shadow Git repository not initialized");
    }

    try {
      const exists = await this.shadowGit.fileExistsInCommit(
        commitHash,
        filepath,
      );
      return exists;
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error(
        `Failed to check if file exists in checkpoint for commit hash: ${commitHash}, filepath: ${filepath}: ${errorMessage}`,
      );
      throw new Error(
        `Failed to check file existence in checkpoint: ${errorMessage}`,
      );
    }
  };

  dispose() {
    this.shadowGit?.dispose();
  }
}
