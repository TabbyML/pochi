/**
 * Environment variable utilities
 */
export interface EnvironmentConfig {
  model: string;
  pochiUrl: string;
  pochiToken: string;
  githubRunId: string;
  githubToken?: string;
}

export function getEnvironmentConfig(): EnvironmentConfig {
  const githubRunId = process.env.GITHUB_RUN_ID;
  if (!githubRunId) {
    throw new Error("Environment variable GITHUB_RUN_ID is not set");
  }

  const pochiToken = process.env.POCHI_SESSION_TOKEN;
  if (!pochiToken) {
    throw new Error(
      "POCHI_SESSION_TOKEN environment variable is required. Please add your pochi session token to GitHub Secrets as POCHI_SESSION_TOKEN.",
    );
  }

  return {
    model: process.env.POCHI_MODEL || "",
    pochiUrl: "https://app.getpochi.com",
    pochiToken,
    githubRunId,
    githubToken: process.env.GITHUB_TOKEN,
  };
}

export function getPochiConfig() {
  const config = getEnvironmentConfig();
  return {
    url: config.pochiUrl,
    token: config.pochiToken,
    model: config.model,
  };
}
