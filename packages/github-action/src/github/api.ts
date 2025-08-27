import type * as github from "@actions/github";
import { graphql } from "@octokit/graphql";
/**
 * GitHub API operations
 */
import { Octokit } from "@octokit/rest";
import type { IssueCommentEvent } from "@octokit/webhooks-types";
import type {
  GitHubPullRequest,
  GitHubRepository,
  PullRequestQueryResponse,
} from "../types";
import { generateRunUrl } from "../utils";

export class GitHubAPI {
  private octoRest: Octokit;
  private octoGraph: typeof graphql;
  private context: typeof github.context;
  private commentId?: number;

  constructor(accessToken: string, context: typeof github.context) {
    this.octoRest = new Octokit({ auth: accessToken });
    this.octoGraph = graphql.defaults({
      headers: { authorization: `token ${accessToken}` },
    });
    this.context = context;
  }

  getRepository(): GitHubRepository {
    return {
      owner: this.context.repo.owner,
      repo: this.context.repo.repo,
    };
  }

  getIssueId(): number {
    const payload = this.context.payload as IssueCommentEvent;
    return payload.issue.number;
  }

  isPullRequest(): boolean {
    const payload = this.context.payload as IssueCommentEvent;
    return Boolean(payload.issue.pull_request);
  }

  async createComment(): Promise<number> {
    const repo = this.getRepository();
    const runUrl = generateRunUrl(repo);

    const response = await this.octoRest.rest.issues.createComment({
      owner: repo.owner,
      repo: repo.repo,
      issue_number: this.getIssueId(),
      body: `[Pochi is preparing...](${runUrl})`,
    });

    this.commentId = response.data.id;
    return this.commentId;
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

  setCommentId(commentId: number): void {
    this.commentId = commentId;
  }

  getCommentId(): number | undefined {
    return this.commentId;
  }

  async fetchPR(): Promise<GitHubPullRequest> {
    const repo = this.getRepository();

    const prResult = await this.octoGraph<PullRequestQueryResponse>(
      `
      query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            title
            body
            author {
              login
            }
            baseRefName
            headRefName
            headRefOid
            createdAt
            additions
            deletions
            state
            baseRepository {
              nameWithOwner
            }
            headRepository {
              nameWithOwner
            }
            commits(first: 100) {
              totalCount
              nodes {
                commit {
                  oid
                  message
                  author {
                    name
                    email
                  }
                }
              }
            }
            files(first: 100) {
              nodes {
                path
                additions
                deletions
                changeType
              }
            }
            comments(first: 100) {
              nodes {
                id
                databaseId
                body
                author {
                  login
                }
                createdAt
              }
            }
            reviews(first: 100) {
              nodes {
                id
                databaseId
                author {
                  login
                }
                body
                state
                submittedAt
                comments(first: 100) {
                  nodes {
                    id
                    databaseId
                    body
                    path
                    line
                    author {
                      login
                    }
                    createdAt
                  }
                }
              }
            }
          }
        }
      }`,
      {
        owner: repo.owner,
        repo: repo.repo,
        number: this.getIssueId(),
      },
    );

    const pr = prResult.repository.pullRequest;
    if (!pr) {
      throw new Error(`PR #${this.getIssueId()} not found`);
    }

    return pr;
  }

  async createPR(
    base: string,
    branch: string,
    title: string,
    body: string,
  ): Promise<number> {
    const repo = this.getRepository();

    const pr = await this.octoRest.rest.pulls.create({
      owner: repo.owner,
      repo: repo.repo,
      head: branch,
      base,
      title,
      body,
    });

    return pr.data.number;
  }

  async fetchRepo() {
    const repo = this.getRepository();
    return await this.octoRest.rest.repos.get({
      owner: repo.owner,
      repo: repo.repo,
    });
  }

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
}
