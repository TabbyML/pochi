/**
 * Environment variable utilities
 */

export function readGithubToken(): string {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    throw new Error(
      "GitHub token not found. Please ensure the `token` input is set in your workflow.",
    );
  }
  return githubToken;
}

export function readPochiConfig() {
  // Token can come from environment variable or be passed as input
  const pochiToken = process.env.POCHI_TOKEN;
  if (!pochiToken) {
    throw new Error(
      "Pochi token not found. Please ensure the `pochi_token` input is set in your workflow or POCHI_TOKEN environment variable is configured.",
    );
  }

  return {
    token: pochiToken,
    model: process.env.POCHI_MODEL,
  };
}