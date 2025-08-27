/**
 * GitHub operations manager
 */
import type * as github from "@actions/github";
import type {
  /* GitHubIssue, */ GitHubPullRequest,
  UserPromptData,
} from "../types";
import { getEnvironmentConfig } from "../utils/environment";
import { GitHubAPI } from "./api";
import {
  buildPromptDataForPR,
  checkPayloadKeyword,
  parseUserPrompt,
} from "./parser";

export class GitHubManager {
  private api: GitHubAPI;
  private accessToken: string;

  constructor(accessToken: string, context: typeof github.context) {
    this.accessToken = accessToken;
    this.api = new GitHubAPI(accessToken, context);

    // Check if comment ID is provided via environment variable
    const existingCommentId = process.env.POCHI_COMMENT_ID;

    if (
      existingCommentId &&
      existingCommentId !== "null" &&
      existingCommentId !== ""
    ) {
      const commentIdNum = Number.parseInt(existingCommentId);
      if (!Number.isNaN(commentIdNum)) {
        this.api.setCommentId(commentIdNum);
      }
    }
  }

  static async create(context: typeof github.context): Promise<GitHubManager> {
    checkPayloadKeyword(context);
    const { githubToken } = getEnvironmentConfig();
    if (!githubToken) {
      throw new Error(
        "GitHub token not found. Please ensure the `github-token` input is set in your workflow.",
      );
    }
    return new GitHubManager(githubToken, context);
  }

  get apiInstance(): GitHubAPI {
    return this.api;
  }

  get token(): string {
    return this.accessToken;
  }

  async checkPermissions(): Promise<void> {
    return this.api.checkPermissions();
  }

  async createComment(): Promise<number> {
    return this.api.createComment();
  }

  async updateComment(body: string): Promise<void> {
    return this.api.updateComment(body);
  }

  async parseUserPrompt(
    context: typeof github.context,
  ): Promise<UserPromptData> {
    return parseUserPrompt(context, this.accessToken);
  }

  async fetchPR(): Promise<GitHubPullRequest> {
    return this.api.fetchPR();
  }

  buildPromptDataForPR(
    pr: GitHubPullRequest,
    context: typeof github.context,
    commentId?: string,
  ): string {
    return buildPromptDataForPR(pr, context, Number(commentId));
  }

  async createPR(
    base: string,
    branch: string,
    title: string,
    body: string,
  ): Promise<number> {
    return this.api.createPR(base, branch, title, body);
  }

  async fetchRepo() {
    return this.api.fetchRepo();
  }

  getRepository() {
    return this.api.getRepository();
  }

  getIssueId(): number {
    return this.api.getIssueId();
  }

  isPullRequest(): boolean {
    return this.api.isPullRequest();
  }

  async cleanup(): Promise<void> {
    // No cleanup needed for the token
  }
}
