import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { toErrorMessage } from "@getpochi/common";
import { GitWorktreeInfo } from "@getpochi/common/vscode-webui-bridge";
import * as runExclusive from "run-exclusive";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

@injectable()
@singleton()
export class GitWorktreeInfoProvider {
  private cache = new Map<string, GitWorktreeInfo>();

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
  ) {
    this.getNextDisplayId = runExclusive
      .buildMethod(this.getNextDisplayId)
      .bind(this);
    this.updateGithubPullRequest = runExclusive
      .buildMethod(this.updateGithubPullRequest)
      .bind(this);
    this.updateGithubIssues = runExclusive
      .buildMethod(this.updateGithubIssues)
      .bind(this);
  }

  private getStorageUri(worktreePath: string): vscode.Uri {
    // Create a safe filename from the worktree path using a hash
    const hash = createHash("sha256").update(worktreePath).digest("hex");
    return vscode.Uri.joinPath(
      this.context.globalStorageUri,
      `worktree-${hash}.json`,
    );
  }

  async get(worktreePath: string): Promise<GitWorktreeInfo | undefined> {
    // Check cache first
    if (this.cache.has(worktreePath)) {
      return this.cache.get(worktreePath);
    }

    // Try to load from disk
    try {
      const uri = this.getStorageUri(worktreePath);
      const data = await readFile(uri.fsPath, "utf8");
      const parsed = GitWorktreeInfo.parse(JSON.parse(data));
      this.cache.set(worktreePath, parsed);
      return parsed;
    } catch (error) {
      // File doesn't exist or is invalid, return undefined
      return undefined;
    }
  }

  async set(
    worktreePath: string,
    data: GitWorktreeInfo,
  ): Promise<GitWorktreeInfo> {
    try {
      const parsed = GitWorktreeInfo.parse(data);
      const uri = this.getStorageUri(worktreePath);

      // Ensure the storage directory exists
      const dir = dirname(uri.fsPath);
      await mkdir(dir, { recursive: true });

      // Write to disk
      await writeFile(uri.fsPath, JSON.stringify(parsed, null, 2), "utf8");

      // Update cache
      this.cache.set(worktreePath, parsed);

      return parsed;
    } catch (error) {
      throw new Error(
        `Failed to set worktree data for path: ${worktreePath}. Error: ${toErrorMessage(error)}`,
      );
    }
  }

  private async initialize(worktreePath: string): Promise<GitWorktreeInfo> {
    const existing = await this.get(worktreePath);
    if (!existing) {
      return await this.set(worktreePath, {
        nextDisplayId: 1,
        github: {},
      });
    }
    return existing;
  }

  async getNextDisplayId(worktreePath: string): Promise<number> {
    let data = await this.get(worktreePath);
    if (!data) {
      data = await this.initialize(worktreePath);
    }
    const id = data.nextDisplayId;
    data.nextDisplayId += 1;
    await this.set(worktreePath, data);
    return id;
  }

  async updateGithubPullRequest(
    worktreePath: string,
    pullRequest: GitWorktreeInfo["github"]["pullRequest"],
  ) {
    let data = await this.get(worktreePath);
    if (!data) {
      data = await this.initialize(worktreePath);
    }
    data.github.pullRequest = pullRequest;
    await this.set(worktreePath, data);
    return pullRequest;
  }

  async getGithubIssues(
    worktreePath: string,
  ): Promise<GitWorktreeInfo["github"]["issues"] | undefined> {
    const data = await this.get(worktreePath);
    return data?.github.issues;
  }

  async updateGithubIssues(
    worktreePath: string,
    issues: GitWorktreeInfo["github"]["issues"],
  ) {
    let data = await this.get(worktreePath);
    if (!data) {
      data = await this.initialize(worktreePath);
    }
    data.github.issues = issues;
    await this.set(worktreePath, data);
    return issues;
  }

  async delete(worktreePath: string): Promise<void> {
    try {
      const uri = this.getStorageUri(worktreePath);
      await unlink(uri.fsPath).catch(() => {
        // Ignore error if file doesn't exist
      });
      this.cache.delete(worktreePath);
    } catch (error) {
      throw new Error(
        `Failed to delete worktree data for path: ${worktreePath}. Error: ${toErrorMessage(error)}`,
      );
    }
  }
}
