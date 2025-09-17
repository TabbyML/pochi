import type * as github from "@actions/github";
import { Octokit, type RestEndpointMethodTypes } from "@octokit/rest";
import type {
  IssueCommentCreatedEvent,
  IssueCommentEvent,
} from "@octokit/webhooks-types";
/**
 * GitHub operations manager
 */
import { isDevMode, readGithubToken } from "./env";
import type { RunPochiRequest } from "./run-pochi";

async function envCheck<T>(
  operation: () => Promise<T>,
  devModeReturn?: T,
): Promise<T> {
  if (isDevMode()) {
    return devModeReturn as T;
  }
  return operation();
}

export class GitHubManager {
  private octokit: Octokit;
  private context: typeof github.context;
  get payload() {
    return this.context.payload as IssueCommentCreatedEvent;
  }

  static async create(context: typeof github.context): Promise<GitHubManager> {
    const githubToken = readGithubToken();
    return new GitHubManager(githubToken, context);
  }

  private constructor(accessToken: string, context: typeof github.context) {
    this.context = context;
    this.octokit = new Octokit({ auth: accessToken });
  }

  async check() {
    this.checkPochiKeyword();
    await this.checkPermissions();
  }

  reportError = async (errorMessage: string): Promise<void> =>
    envCheck(async () => {
      const repo = this.getRepository();
      const payload = this.context.payload as IssueCommentEvent;
      const issueNumber = payload.issue.number;

      await this.octokit.rest.issues.createComment({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: issueNumber,
        body: `❌ **Pochi Failed**\n${errorMessage}`,
      });
    });

  createComment = async (initialContent: string): Promise<number> =>
    envCheck(async () => {
      const repo = this.getRepository();
      const payload = this.context.payload as IssueCommentEvent;
      const issueNumber = payload.issue.number;
      const footer = this.createGitHubActionFooter();

      const response = await this.octokit.rest.issues.createComment({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: issueNumber,
        body: `🔄 **Pochi Running...**\n\n${initialContent}${footer}`,
      });
      return response.data.id;
    }, 999999);

  updateComment = async (
    commentId: number,
    body: string,
    options?: {
      header?: string;
      footer?: string;
      success?: boolean;
    },
  ): Promise<void> =>
    envCheck(async () => {
      const repo = this.getRepository();

      // Use provided header or generate default based on success state
      const header =
        options?.header ??
        (options?.success !== undefined
          ? options.success
            ? "✅ **Pochi Completed**"
            : "❌ **Pochi Failed**"
          : "🔄 **Pochi Running...**");

      // Use provided footer or generate default GitHub Action footer
      const footer = options?.footer ?? this.createGitHubActionFooter();

      await this.octokit.rest.issues.updateComment({
        owner: repo.owner,
        repo: repo.repo,
        comment_id: commentId,
        body: `${header}\n\n${body}${footer}`,
      });
    });

  createReaction = async (
    commentId: number,
    content: RestEndpointMethodTypes["reactions"]["createForIssueComment"]["parameters"]["content"],
  ): Promise<number | undefined> =>
    envCheck(async () => {
      const repo = this.getRepository();
      try {
        const response =
          await this.octokit.rest.reactions.createForIssueComment({
            owner: repo.owner,
            repo: repo.repo,
            comment_id: commentId,
            content: content as
              | "+1"
              | "-1"
              | "laugh"
              | "confused"
              | "heart"
              | "hooray"
              | "rocket"
              | "eyes",
          });
        return response.data.id;
      } catch (error) {
        console.warn(`Failed to add reaction ${content}: ${error}`);
        return undefined;
      }
    });

  deleteReaction = async (
    commentId: number,
    reactionId: number,
  ): Promise<void> =>
    envCheck(async () => {
      const repo = this.getRepository();
      try {
        await this.octokit.rest.reactions.deleteForIssueComment({
          owner: repo.owner,
          repo: repo.repo,
          comment_id: commentId,
          reaction_id: reactionId,
        });
      } catch (error) {
        console.warn(`Failed to delete reaction ${reactionId}: ${error}`);
      }
    });

  // Repository operations
  private getRepository() {
    return {
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
    };
  }

  // GitHub Action URL operations
  private getGitHubActionUrl(): string {
    const runId = process.env.GITHUB_RUN_ID;
    const repository = process.env.GITHUB_REPOSITORY; // owner/repo format

    if (!runId || !repository) {
      // Fallback to actions page if run ID or repository is not available
      return `https://github.com/${repository || "unknown"}/actions`;
    }

    return `https://github.com/${repository}/actions/runs/${runId}`;
  }

  createGitHubActionFooter(): string {
    const actionUrl = this.getGitHubActionUrl();
    return `\n\n🔗 **[View GitHub Action](${actionUrl})**`;
  }

  // Permission and user operations
  private checkPermissions = async (): Promise<void> =>
    envCheck(async () => {
      const actor = this.context.actor;
      const repo = this.getRepository();

      if (this.context.payload.sender?.type === "Bot") {
        return;
      }

      let permission: string;
      try {
        const response =
          await this.octokit.repos.getCollaboratorPermissionLevel({
            owner: repo.owner,
            repo: repo.repo,
            username: actor,
          });

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
    });

  // Validation and parsing operations
  private checkPochiKeyword(): void {
    const body = this.payload.comment.body.trim();
    if (!body.match(/(?:^|\s)\/pochi(?=$|\s)/)) {
      throw new Error("Comments must mention `/pochi`");
    }
  }

  parseRequest(): RunPochiRequest {
    const prompt = this.parsePrompt();
    const event = {
      ...this.payload,
      comment: undefined,
    };
    return {
      prompt,
      event,
      commentId: this.payload.comment.id,
    };
  }

  private parsePrompt() {
    const body = this.payload.comment.body.trim();

    const prompt = body.replace(/^\/pochi\s*/, "").trim();
    if (!prompt) {
      throw new Error("No query provided after `/pochi`");
    }

    return prompt;
  }
}
