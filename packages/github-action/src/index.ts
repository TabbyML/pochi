#!/usr/bin/env bun
/**
 * pochi GitHub Action - Simplified Main Entry Point
 */

import * as core from "@actions/core";
import * as github from "@actions/github";
import { GitHubManager } from "./github-manager";
import { PochiRunner } from "./runner";

async function main(): Promise<void> {
  try {
    // Basic setup
    if (github.context.eventName !== "issue_comment") {
      throw new Error(`Unsupported event type: ${github.context.eventName}`);
    }

    const githubManager = await GitHubManager.create(github.context);
    await githubManager.checkPermissions();

    if (!githubManager.isPullRequest()) {
      const commentId = process.env.POCHI_COMMENT_ID
        ? Number.parseInt(process.env.POCHI_COMMENT_ID)
        : undefined;
      if (commentId) {
        await githubManager.updateComment(
          "❌ This action only responds to PR comments. Please use this in a Pull Request.\n\n🤖 Generated with [Pochi](https://getpochi.com)",
        );
      }
      process.exit(0);
    }

    // Parse user prompt - pass only original query to runner
    const { userPrompt, promptFiles } = await githubManager.parseUserPrompt();

    // Let runner handle everything with original user prompt only
    const runner = new PochiRunner();

    const response = await runner.runTask({
      prompt: userPrompt,
      files: promptFiles,
    });

    if (!response.success) {
      throw new Error(response.error || "pochi task failed");
    }

    // Task completed - CLI should have updated the comment
  } catch (error) {
    console.error("Error:", error);
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
