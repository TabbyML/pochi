/**
 * Environment variable utilities
 */

export function readGithubToken(): string {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error(
      "GitHub token not found. Please ensure the `github-token` input is set in your workflow.",
    );
  }
  return githubToken;
}

export function readPochiConfig() {
  const pochiToken = process.env.POCHI_API_KEY;

  return {
    token: pochiToken,
    model: process.env.POCHI_MODEL,
  };
}

/**
 * Check if running in development/testing mode
 */
export function isDevMode(): boolean {
  return process.env.POCHI_DEV === "true";
}

/**
 * Check if running in remote environment (GitHub Actions)
 */
export function isRemoteEnv(): boolean {
  return process.env.POCHI_REMOTE_ENV === "1";
}

/**
 * Get progress comment ID from environment
 * This is the GitHub comment that displays real-time execution progress
 * Set by preprocess-action.ts and used by run-pochi.ts
 */
export function getProgressCommentId(): number | undefined {
  const id = process.env.PROGRESS_COMMENT_ID;
  return id ? Number.parseInt(id, 10) : undefined;
}

/**
 * Get eyes reaction ID from environment
 * This is the 👀 reaction on the original /pochi command comment
 * Added immediately for user feedback, removed when task completes
 */
export function getEyesReactionId(): number | undefined {
  const id = process.env.EYES_REACTION_ID;
  return id ? Number.parseInt(id, 10) : undefined;
}
