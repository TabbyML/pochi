/**
 * GitHub operations manager
 */
import path from "node:path";
import { getGitHubToken } from "@/environment";
import type * as github from "@actions/github";
import { Octokit } from "@octokit/rest";
import type { IssueCommentEvent } from "@octokit/webhooks-types";
import type { PromptFile } from "./types";
interface GitHubRepository {
  owner: string;
  repo: string;
}

interface UserPromptData {
  userPrompt: string;
  promptFiles: PromptFile[];
}

export class GitHubManager {
  private octoRest: Octokit;
  private context: typeof github.context;
  private commentId?: number;
  private accessToken: string;

  constructor(accessToken: string, context: typeof github.context) {
    this.accessToken = accessToken;
    this.context = context;
    this.octoRest = new Octokit({ auth: accessToken });

    const existingCommentId = process.env.POCHI_COMMENT_ID;

    if (
      existingCommentId &&
      existingCommentId !== "null" &&
      existingCommentId !== ""
    ) {
      const commentIdNum = Number.parseInt(existingCommentId);
      if (!Number.isNaN(commentIdNum)) {
        this.commentId = commentIdNum;
      }
    }
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

  async updateComment(body: string): Promise<void> {
    if (!this.commentId) return;

    const repo = this.getRepository();

    await this.octoRest.rest.issues.updateComment({
      owner: repo.owner,
      repo: repo.repo,
      comment_id: this.commentId,
      body,
    });
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

  async parseUserPrompt(): Promise<UserPromptData> {
    let prompt = (() => {
      const payload = this.context.payload as IssueCommentEvent;
      const body = payload.comment.body.trim();
      if (body === "/pochi") return "Summarize this thread";
      if (body.includes("/pochi")) return body;
      throw new Error("Comments must mention `/pochi`");
    })();

    const imgData: PromptFile[] = [];

    const mdMatches = prompt.matchAll(
      /!?\[.*?\]\((https:\/\/github\.com\/user-attachments\/[^)]+)\)/gi,
    );
    const tagMatches = prompt.matchAll(
      /<img .*?src="(https:\/\/github\.com\/user-attachments\/[^"]+)" \/>/gi,
    );
    const matches = [...mdMatches, ...tagMatches].sort(
      (a, b) => (a.index || 0) - (b.index || 0),
    );

    let offset = 0;
    for (const m of matches) {
      const tag = m[0];
      const url = m[1];
      const start = m.index || 0;

      if (!url) continue;
      const filename = path.basename(url);

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });
      if (!res.ok) {
        console.error(`Failed to download image: ${url}`);
        continue;
      }

      const replacement = `@${filename}`;
      prompt =
        prompt.slice(0, start + offset) +
        replacement +
        prompt.slice(start + offset + tag.length);
      offset += replacement.length - tag.length;

      const contentType = res.headers.get("content-type");
      imgData.push({
        filename,
        mime: contentType?.startsWith("image/") ? contentType : "text/plain",
        content: Buffer.from(await res.arrayBuffer()).toString("base64"),
        start,
        end: start + replacement.length,
        replacement,
      });
    }

    return { userPrompt: prompt, promptFiles: imgData };
  }
}
