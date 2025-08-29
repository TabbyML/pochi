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
  const pochiToken = process.env.POCHI_TOKEN;
  if (!pochiToken) {
    throw new Error(
      "POCHI_TOKEN environment variable is required. Please add your pochi session token to GitHub Secrets as POCHI_TOKEN.",
    );
  }

  return {
    token: pochiToken,
    model: process.env.POCHI_MODEL || "",
  };
}
