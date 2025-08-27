/**
 * Core workflow orchestration using manager classes
 */
import * as core from "@actions/core";
import * as github from "@actions/github";
import { GitManager } from "./git-manager";
import { GitHubManager } from "./github";
import { PochiRunner } from "./runner";
import type { PromptFile } from "./types";

export class PochiWorkflow {
  private github: GitHubManager;
  private git: GitManager;
  private runner: PochiRunner;
  private exitCode = 0;

  constructor(githubManager: GitHubManager, gitManager: GitManager, pochiRunner: PochiRunner) {
    this.github = githubManager;
    this.git = gitManager;
    this.runner = pochiRunner;
  }

  static async create(): Promise<PochiWorkflow> {
    checkContextEvent("issue_comment");

    const githubManager = await GitHubManager.create(github.context);
    const gitManager = new GitManager();
    const pochiRunner = new PochiRunner();

    return new PochiWorkflow(githubManager, gitManager, pochiRunner);
  }

  async execute(): Promise<number> {
    try {
      console.log("🚀 [POCHI DEBUG] Starting workflow execution...");
      await this.github.checkPermissions();
      
      // Only create comment if it doesn't exist already (from curl in action.yml)
      const existingCommentId = process.env.POCHI_COMMENT_ID;
      console.log(`🚀 [POCHI DEBUG] Checking for existing comment ID: "${existingCommentId}"`);
      if (!existingCommentId) {
        console.log("🚀 [POCHI DEBUG] No existing comment ID, creating new comment...");
        await this.github.createComment();
      } else {
        console.log("🚀 [POCHI DEBUG] Using existing comment, skipping creation");
      }

      await this.git.configure(this.github.token);

      const { userPrompt, promptFiles } = await this.github.parseUserPrompt(github.context);

      if (!this.github.isPullRequest()) {
        await this.github.updateComment(
          `❌ This action only responds to PR comments. Please use this in a Pull Request.${this.generateFooter()}`,
        );
        return this.exitCode;
      }

      await this.handlePullRequest(userPrompt, promptFiles);
    } catch (e: unknown) {
      this.exitCode = 1;
      console.error(e);

      const msg = this.formatError(e);
      await this.github.updateComment(`${msg}${this.generateFooter()}`);
      core.setFailed(msg);
    } finally {
      await this.cleanup();
    }

    return this.exitCode;
  }

  private async handlePullRequest(userPrompt: string, promptFiles: PromptFile[]): Promise<void> {
    const prData = await this.github.fetchPR();
    const dataPrompt = this.github.buildPromptDataForPR(prData, github.context);
    const isFork = prData.headRepository.nameWithOwner !== prData.baseRepository.nameWithOwner;

    const checkout = isFork
      ? () => this.git.checkoutForkBranch(this.github.getIssueId())
      : () => this.git.checkoutLocalBranch(prData);

    const commitAndPush = isFork
      ? (summary: string) => this.git.commitAndPushForkBranch(summary, github.context)
      : (summary: string) => this.git.commitAndPushLocalBranch(summary);

    await checkout();

    const response = await this.runner.runTask({
      prompt: `${userPrompt}\n\n${dataPrompt}`,
      files: promptFiles,
    });

    if (!response.success) {
      throw new Error(response.error || "pochi task failed");
    }

    if (await this.git.isBranchDirty()) {
      const summary = await this.runner.summarizeContent(response.output);
      await commitAndPush(summary);
    }

    await this.github.updateComment(`${response.output}${this.generateFooter()}`);
  }

  private formatError(e: unknown): string {
    if (e instanceof Error) {
      return e.message;
    }
    return String(e);
  }

  private generateFooter(): string {
    const repo = this.github.getRepository();
    return '\n🤖 Generated with [Pochi](https://getpochi.com)';
  }

  private async cleanup(): Promise<void> {
    await this.git.restore();
    await this.github.cleanup();
  }
}

function checkContextEvent(...events: string[]): void {
  const context = github.context;
  if (!events.includes(context.eventName)) {
    throw new Error(`Unsupported event type: ${context.eventName}`);
  }
}
