/**
 * GitHub operations manager
 */
import type * as github from "@actions/github";
import type { /* GitHubIssue, */ GitHubPullRequest, UserPromptData } from "../types";
import { GitHubAPI } from "./api";
import { getEnvironmentConfig } from "../utils/environment";
import { checkPayloadKeyword, buildPromptDataForPR, parseUserPrompt } from "./parser";

export class GitHubManager {
  private api: GitHubAPI;
  private accessToken: string;

  constructor(accessToken: string, context: typeof github.context) {
    this.accessToken = accessToken;
    this.api = new GitHubAPI(accessToken, context);
    
    // Check if comment ID is provided via environment variable
    const existingCommentId = process.env.POCHI_COMMENT_ID;
    console.log(`🚀 [POCHI DEBUG] Environment POCHI_COMMENT_ID: "${existingCommentId}"`);
    console.log("🚀 [POCHI DEBUG] All environment variables starting with POCHI_:");
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('POCHI_')) {
        console.log(`🚀 [POCHI DEBUG]   ${key} = "${value}"`);
      }
    }
    
    if (existingCommentId && existingCommentId !== 'null' && existingCommentId !== '') {
      const commentIdNum = Number.parseInt(existingCommentId);
      console.log(`🚀 [POCHI DEBUG] Parsed comment ID: ${commentIdNum}`);
      if (!Number.isNaN(commentIdNum)) {
        this.api.setCommentId(commentIdNum);
        console.log(`🚀 [POCHI DEBUG] ✅ Using existing comment ID: ${this.api.getCommentId()}`);
      } else {
        console.log(`🚀 [POCHI DEBUG] ❌ Invalid comment ID: ${existingCommentId}`);
      }
    } else {
      console.log('🚀 [POCHI DEBUG] ❌ No existing comment ID found, will create new comment');
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

  async parseUserPrompt(context: typeof github.context): Promise<UserPromptData> {
    return parseUserPrompt(context, this.accessToken);
  }

  async fetchPR(): Promise<GitHubPullRequest> {
    return this.api.fetchPR();
  }

  buildPromptDataForPR(pr: GitHubPullRequest, context: typeof github.context, commentId?: string): string {
    return buildPromptDataForPR(pr, context,  Number(commentId));
  }

  async createPR(base: string, branch: string, title: string, body: string): Promise<number> {
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
  }}
