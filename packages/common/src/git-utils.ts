/**
 * Utility functions for parsing git URLs and extracting repository information
 */

export type GitPlatform = "github" | "gitlab" | "bitbucket" | "unknown";

export interface GitRepositoryInfo {
  /** The platform (e.g., 'github', 'gitlab', 'bitbucket') */
  platform: GitPlatform;
  /** The owner/organization name */
  owner: string;
  /** The repository name */
  repo: string;
  /** The full shorthand (e.g., 'TabbyML/tabby') */
  shorthand: string;
  /** The URL to the repository on the web */
  webUrl: string;
}

/**
 * Parses a git origin URL and extracts repository information
 * Supports both HTTPS and SSH formats for GitHub, GitLab, and Bitbucket
 *
 * @param originUrl - The git origin URL
 * @returns GitRepositoryInfo if the URL is recognized, null otherwise
 */
export function parseGitOriginUrl(originUrl: string): GitRepositoryInfo | null {
  if (!originUrl) return null;

  // Remove trailing .git if present
  const cleanUrl = originUrl.replace(/\.git$/, "");

  // GitHub patterns
  const githubHttpsMatch = cleanUrl.match(
    /^https:\/\/github\.com\/([^\/]+)\/([^\/]+)/,
  );
  if (githubHttpsMatch) {
    const [, owner, repo] = githubHttpsMatch;
    return {
      platform: "github",
      owner,
      repo,
      shorthand: `${owner}/${repo}`,
      webUrl: `https://github.com/${owner}/${repo}`,
    };
  }

  const githubSshMatch = cleanUrl.match(/^git@github\.com:([^\/]+)\/([^\/]+)/);
  if (githubSshMatch) {
    const [, owner, repo] = githubSshMatch;
    return {
      platform: "github",
      owner,
      repo,
      shorthand: `${owner}/${repo}`,
      webUrl: `https://github.com/${owner}/${repo}`,
    };
  }

  // GitLab patterns
  const gitlabHttpsMatch = cleanUrl.match(
    /^https:\/\/gitlab\.com\/([^\/]+)\/([^\/]+)/,
  );
  if (gitlabHttpsMatch) {
    const [, owner, repo] = gitlabHttpsMatch;
    return {
      platform: "gitlab",
      owner,
      repo,
      shorthand: `${owner}/${repo}`,
      webUrl: `https://gitlab.com/${owner}/${repo}`,
    };
  }

  const gitlabSshMatch = cleanUrl.match(/^git@gitlab\.com:([^\/]+)\/([^\/]+)/);
  if (gitlabSshMatch) {
    const [, owner, repo] = gitlabSshMatch;
    return {
      platform: "gitlab",
      owner,
      repo,
      shorthand: `${owner}/${repo}`,
      webUrl: `https://gitlab.com/${owner}/${repo}`,
    };
  }

  // Bitbucket patterns
  const bitbucketHttpsMatch = cleanUrl.match(
    /^https:\/\/bitbucket\.org\/([^\/]+)\/([^\/]+)/,
  );
  if (bitbucketHttpsMatch) {
    const [, owner, repo] = bitbucketHttpsMatch;
    return {
      platform: "bitbucket",
      owner,
      repo,
      shorthand: `${owner}/${repo}`,
      webUrl: `https://bitbucket.org/${owner}/${repo}`,
    };
  }

  const bitbucketSshMatch = cleanUrl.match(
    /^git@bitbucket\.org:([^\/]+)\/([^\/]+)/,
  );
  if (bitbucketSshMatch) {
    const [, owner, repo] = bitbucketSshMatch;
    return {
      platform: "bitbucket",
      owner,
      repo,
      shorthand: `${owner}/${repo}`,
      webUrl: `https://bitbucket.org/${owner}/${repo}`,
    };
  }

  return null;
}

export const getWorktreeName = (
  worktreeDir: string | undefined,
): string | undefined => {
  return worktreeDir?.endsWith(".git")
    ? undefined
    : worktreeDir?.split(/[\/\\]/).pop();
};
