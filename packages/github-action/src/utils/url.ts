/**
 * URL generation utilities
 */
import type { GitHubRepository } from "../types";
import { getEnvironmentConfig } from "./environment";

export function generateRunUrl(repo: GitHubRepository): string {
  const { githubRunId } = getEnvironmentConfig();
  return `https://github.com/${repo.owner}/${repo.repo}/actions/runs/${githubRunId}`;
}

export function generateBranchName(type: "issue" | "pr", issueId: number): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:-]/g, "")
    .replace(/\.\d{3}Z/, "")
    .replace("T", "");
  return `pochi/${type}${issueId}-${timestamp}`;
}
