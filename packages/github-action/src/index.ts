#!/usr/bin/env bun
/**
 * pochi GitHub Action - Simplified Main Entry Point
 */

import * as core from "@actions/core";
import * as github from "@actions/github";
import { GitHubManager } from "./github-manager";
import { runPochi } from "./run-pochi";

async function main(): Promise<void> {
  let githubManager: GitHubManager | null = null;

  try {
    // Basic setup
    if (github.context.eventName !== "issue_comment") {
      throw new Error(`Unsupported event type: ${github.context.eventName}`);
    }

    githubManager = await GitHubManager.create(github.context);
    await githubManager.check();

    // Parse user prompt - pass only original query to runner
    const userPrompt = githubManager.parseRequest();

    // Let runner handle everything with original user prompt only
    await runPochi(userPrompt, githubManager);

    // Task completed successfully
  } catch (error) {
    console.error("Error:", error);
    if (githubManager && error instanceof Error) {
      await githubManager.reportError(error.message);
    }
    core.setFailed(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Promise Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
