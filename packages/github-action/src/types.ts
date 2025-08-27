/**
 * pochi GitHub Action - Type Definitions
 *
 * Comprehensive type definitions for GitHub API responses,
 * pochi integration, and configuration options.
 */

export interface GitHubAuthor {
  login: string;
  name?: string;
}

export interface GitHubComment {
  id: string;
  databaseId: string;
  body: string;
  author: GitHubAuthor;
  createdAt: string;
}

export interface GitHubReviewComment extends GitHubComment {
  path: string;
  line: number | null;
}

export interface GitHubCommit {
  oid: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
}

export interface GitHubFile {
  path: string;
  additions: number;
  deletions: number;
  changeType: string;
}

export interface GitHubReview {
  id: string;
  databaseId: string;
  author: GitHubAuthor;
  body: string;
  state: string;
  submittedAt: string;
  comments: {
    nodes: GitHubReviewComment[];
  };
}

export interface GitHubPullRequest {
  title: string;
  body: string;
  author: GitHubAuthor;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  createdAt: string;
  additions: number;
  deletions: number;
  state: string;
  baseRepository: {
    nameWithOwner: string;
  };
  headRepository: {
    nameWithOwner: string;
  };
  commits: {
    totalCount: number;
    nodes: Array<{
      commit: GitHubCommit;
    }>;
  };
  files: {
    nodes: GitHubFile[];
  };
  comments: {
    nodes: GitHubComment[];
  };
  reviews: {
    nodes: GitHubReview[];
  };
}

export interface PullRequestQueryResponse {
  repository: {
    pullRequest: GitHubPullRequest;
  };
}

export interface GitHubRepository {
  owner: string;
  repo: string;
}

export interface PromptFile {
  filename: string;
  mime: string;
  content: string;
  start: number;
  end: number;
  replacement: string;
}

export interface UserPromptData {
  userPrompt: string;
  promptFiles: PromptFile[];
}
