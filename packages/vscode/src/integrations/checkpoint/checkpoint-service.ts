import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { getWorkspaceFolder } from "@/lib/fs";
import { getLogger, toErrorMessage } from "@getpochi/common";
import type {
  SaveCheckpointOptions,
  UserEditsDiff,
} from "@getpochi/common/vscode-webui-bridge";
import { inject, injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";
import { ShadowGitRepo } from "./shadow-git-repo";
import type { GitDiff } from "./types";
import {
  Deferred,
  filterGitChanges,
  processGitChangesToUserEdits,
} from "./util";

const logger = getLogger("CheckpointService");

@injectable()
@singleton()
export class CheckpointService implements vscode.Disposable {
  private shadowGit: ShadowGitRepo | undefined;
  private readyDefer = new Deferred<void>();
  private initialized = false;

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
  ) {}

  /**
   * Lazy initializes the checkpoint service.
   * @returns A promise that resolves when the checkpoint service is initialized.
   */
  private async ensureInitialized() {
    if (!this.initialized) {
      this.initialized = true;
      await this.init();
    }
    return this.readyDefer.promise;
  }

  private async init() {
    try {
      const gitPath = await this.getShadowGitPath();
      this.shadowGit = await ShadowGitRepo.getOrCreate(
        gitPath,
        getWorkspaceFolder().uri.fsPath,
      );
      logger.trace("Shadow Git repository initialized at", gitPath);
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
      const commitMessage = `checkpoint-${message}`;
      const commitHash = await this.shadowGit.commit(commitMessage);
      logger.trace(
        `Successfully saved checkpoint with message: ${message}, commit hash: ${commitHash}`,
      );
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
  restoreCheckpoint = async (commitHash: string): Promise<void> => {
    logger.trace(`Restoring checkpoint for commit hash: ${commitHash}`);
    await this.ensureInitialized();

    if (!this.shadowGit) {
      throw new Error("Shadow Git repository not initialized");
    }

    try {
      await this.shadowGit.reset(commitHash);
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error(
        `Failed to restore checkpoint for commit hash: ${commitHash}: ${errorMessage}`,
      );
      throw new Error(`Failed to restore checkpoint: ${errorMessage}`);
    }
  };

  async getShadowGitPath() {
    if (!this.context.storageUri) {
      throw new Error("Extension storage URI is not available");
    }
    const storagePath = this.context.storageUri.fsPath;
    const checkpointDir = path.join(storagePath, "checkpoint");
    await mkdir(checkpointDir, { recursive: true });
    return checkpointDir;
  }

  getCheckpointChanges = async (
    from: string,
    to?: string,
  ): Promise<GitDiff[]> => {
    await this.ensureInitialized();
    if (!this.shadowGit) {
      throw new Error("Shadow Git repository not initialized");
    }
    try {
      const changes = await this.shadowGit.getDiff(from, to);
      return filterGitChanges(changes, 48 * 1024); // 48 KB
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error(
        `Failed to get changes for commit hash: ${from} to: ${to}: ${errorMessage}`,
        { error },
      );
      throw new Error(`Failed to get changes: ${errorMessage}`);
    }
  };

  getCheckpointUserEditsDiff = async (
    from: string,
    to?: string,
  ): Promise<UserEditsDiff[] | null> => {
    await this.ensureInitialized();
    if (!this.shadowGit) {
      throw new Error("Shadow Git repository not initialized");
    }
    try {
      const changes = await this.shadowGit.getDiff(from, to);
      return processGitChangesToUserEdits(changes);
    } catch (error) {
      const errorMessage = toErrorMessage(error);
      logger.error(
        `Failed to get user edits for commit hash: ${from} to: ${to}: ${errorMessage}`,
        { error },
      );
      return null;
    }
  };

  dispose() {
    this.shadowGit?.dispose();
  }
}
