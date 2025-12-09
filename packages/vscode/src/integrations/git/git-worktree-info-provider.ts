import { toErrorMessage } from "@getpochi/common";
import { GitWorktreeInfo } from "@getpochi/common/vscode-webui-bridge";
import { inject, injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

@injectable()
@singleton()
export class GitWorktreeInfoProvider {
  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
  ) {}

  get(worktreePath: string): GitWorktreeInfo | undefined {
    const raw = this.context.globalState.get<GitWorktreeInfo>(worktreePath);
    return raw;
  }

  set(worktreePath: string, data: GitWorktreeInfo) {
    try {
      const parsed = GitWorktreeInfo.parse(data);
      this.context.globalState.update(worktreePath, parsed);
      return parsed;
    } catch (error) {
      throw new Error(
        `Failed to set worktree data for path: ${worktreePath}. Error: ${toErrorMessage(error)}`,
      );
    }
  }

  initialize(worktreePath: string) {
    const existing = this.get(worktreePath);
    if (!existing) {
      return this.set(worktreePath, {
        nextDisplayId: 1,
        github: {},
      });
    }
    return existing;
  }

  getNextDisplayId(worktreePath: string): number {
    let data = this.get(worktreePath);
    if (!data) {
      data = this.initialize(worktreePath);
    }
    const id = data.nextDisplayId;
    data.nextDisplayId += 1;
    this.set(worktreePath, data);
    return id;
  }

  updateGithubPullRequest(
    worktreePath: string,
    pullRequest: GitWorktreeInfo["github"]["pullRequest"],
  ) {
    let data = this.get(worktreePath);
    if (!data) {
      data = this.initialize(worktreePath);
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

  updateGithubIssues(
    worktreePath: string,
    issues: GitWorktreeInfo["github"]["issues"],
  ) {
    let data = this.get(worktreePath);
    if (!data) {
      data = this.initialize(worktreePath);
    }
    data.github.issues = issues;
    this.set(worktreePath, data);
    return issues;
  }

  delete(worktreePath: string) {
    this.context.globalState.update(worktreePath, undefined);
  }
}
