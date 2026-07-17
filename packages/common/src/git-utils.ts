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

/**
 * parse worktree name from worktree gitdir path like /path/to/repo/.git/worktrees/worktree-name
 * @param worktreeDir
 * @returns
 */
export const getWorktreeNameFromGitDir = (
  worktreeDir: string | undefined,
): string | undefined => {
  if (!worktreeDir) {
    return undefined;
  }
  const reg = /\.git\/worktrees\/([^\/]+)/;
  const match = worktreeDir?.match(reg);
  if (match?.[1]) {
    return match[1];
  }
  return "main";
};

export const getWorktreeNameFromWorktreePath = (
  worktreePath?: string | null,
) => {
  if (!worktreePath) return undefined;
  return worktreePath.split(/[\\|/]/).pop();
};

/**
 * Normalize a filesystem path for equality comparison across sources that may
 * disagree on path separators or drive-letter casing.
 *
 * On Windows this matters because git emits forward-slash, upper-cased-drive
 * paths (e.g. `C:/Users/foo/repo`) while VS Code's `Uri.fsPath` emits
 * back-slash, lower-cased-drive paths (e.g. `c:\\Users\\foo\\repo`). Without
 * normalization these never match, which previously hid tasks from the task
 * list when the workspace was a git repository.
 */
export const normalizePathForComparison = (
  filePath?: string | null,
): string => {
  if (!filePath) return "";
  // Unify separators and drop any trailing slashes.
  let normalized = filePath.replace(/\\/g, "/").replace(/\/+$/, "");
  // Lower-case Windows drive letters (`C:` -> `c:`).
  if (/^[a-zA-Z]:/.test(normalized)) {
    normalized = normalized.charAt(0).toLowerCase() + normalized.slice(1);
  }
  return normalized;
};
