import { toErrorMessage } from "@getpochi/common";
import { GitWorktreeInfo } from "@getpochi/common/vscode-webui-bridge";
import * as runExclusive from "run-exclusive";
import { inject, injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

@injectable()
@singleton()
export class GitWorktreeInfoProvider {
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

  get(worktreePath: string): GitWorktreeInfo | undefined {
    const raw = this.context.globalState.get<GitWorktreeInfo>(worktreePath);
    return raw;
  }

  async set(worktreePath: string, data: GitWorktreeInfo) {
    try {
      const parsed = GitWorktreeInfo.parse(data);
      await this.context.globalState.update(worktreePath, parsed);
      return parsed;
    } catch (error) {
      throw new Error(
        `Failed to set worktree data for path: ${worktreePath}. Error: ${toErrorMessage(error)}`,
      );
    }
  }

  private async initialize(worktreePath: string) {
    const existing = this.get(worktreePath);
    if (!existing) {
      return await this.set(worktreePath, {
        nextDisplayId: 1,
        github: {},
      });
    }
    return existing;
  }

  async getNextDisplayId(worktreePath: string): Promise<number> {
    let data = this.get(worktreePath);
    if (!data) {
      data = await this.initialize(worktreePath);
    }
    const id = data.nextDisplayId;
    data.nextDisplayId += 1;
    this.set(worktreePath, data);
    return id;
  }

  async updateGithubPullRequest(
    worktreePath: string,
    pullRequest: GitWorktreeInfo["github"]["pullRequest"],
  ) {
    let data = this.get(worktreePath);
    if (!data) {
      data = await this.initialize(worktreePath);
    }
    data.github.pullRequest = pullRequest;
    this.set(worktreePath, data);
    return pullRequest;
  }

  getGithubIssues(
    worktreePath: string,
  ): GitWorktreeInfo["github"]["issues"] | undefined {
    const data = this.get(worktreePath);
    return data?.github.issues;
  }

  async updateGithubIssues(
    worktreePath: string,
    issues: GitWorktreeInfo["github"]["issues"],
  ) {
    let data = this.get(worktreePath);
    if (!data) {
      data = await this.initialize(worktreePath);
    }
    data.github.issues = issues;
    this.set(worktreePath, data);
    return issues;
  }

  delete(worktreePath: string) {
    this.context.globalState.update(worktreePath, undefined);
  }
}
