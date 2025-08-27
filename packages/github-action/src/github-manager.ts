/**
 * GitHub operations manager
 */
import { getGitHubToken } from "@/environment";
import type * as github from "@actions/github";
import { Octokit } from "@octokit/rest";
import type { IssueCommentEvent } from "@octokit/webhooks-types";

interface GitHubRepository {
  owner: string;
  repo: string;
}

export class GitHubManager {
  private octoRest: Octokit;
  private context: typeof github.context;

  constructor(accessToken: string, context: typeof github.context) {
    this.context = context;
    this.octoRest = new Octokit({ auth: accessToken });
  }

  static async create(context: typeof github.context): Promise<GitHubManager> {
    GitHubManager.checkPayloadKeyword(context);

    const githubToken = getGitHubToken();
    return new GitHubManager(githubToken, context);
  }

  // Repository operations
  getRepository(): GitHubRepository {
    return {
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
    };
  }

  isPullRequest(): boolean {
    const payload = this.context.payload as IssueCommentEvent;
    return Boolean(payload.issue.pull_request);
  }

  async postErrorComment(errorMessage: string): Promise<void> {
    try {
      const repo = this.getRepository();
      const payload = this.context.payload as IssueCommentEvent;
      const issueNumber = payload.issue.number;

      await this.octoRest.rest.issues.createComment({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: issueNumber,
        body: `❌ **Pochi Task Failed**

${errorMessage}

🤖 Generated with [Pochi](https://getpochi.com)`,
      });
    } catch (error) {
      console.error("Failed to post error comment:", error);
    }
  }

  // Permission and user operations
  async checkPermissions(): Promise<void> {
    const actor = this.context.actor;
    const repo = this.getRepository();
    if (this.context.payload.sender?.type === "Bot") {
      return;
    }
    let permission: string;
    try {
      const response = await this.octoRest.repos.getCollaboratorPermissionLevel(
        {
          owner: repo.owner,
          repo: repo.repo,
          username: actor,
        },
      );

      permission = response.data.permission;
    } catch (error) {
      console.error(`Failed to check permissions: ${error}`);
      throw new Error(
        `Failed to check permissions for user ${actor}: ${error}`,
      );
    }

    if (!["admin", "write"].includes(permission)) {
      throw new Error(`User ${actor} does not have write permissions`);
    }
  }

  // Validation and parsing operations
  private static checkPayloadKeyword(context: typeof github.context): void {
    const payload = context.payload as IssueCommentEvent;
    const body = payload.comment.body.trim();
    if (!body.match(/(?:^|\s)\/pochi(?=$|\s)/)) {
      throw new Error("Comments must mention `/pochi`");
    }
  }

  parseUserPrompt(): string {
    const payload = this.context.payload as IssueCommentEvent;
    const body = payload.comment.body.trim();
    if (body === "/pochi") return "Summarize this thread";
    if (body.includes("/pochi")) return body;
    throw new Error("Comments must mention `/pochi`");
  }
}
