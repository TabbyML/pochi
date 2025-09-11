#!/usr/bin/env bun
/**
 * Preprocess action script for initial reaction and progress comment setup
 */

import * as core from "@actions/core";
import * as github from "@actions/github";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import { GitHubManager } from "./github-manager";

async function setup() {
  try {
    const githubManager = await GitHubManager.create(github.context);
    const payload = github.context.payload as IssueCommentCreatedEvent;

    const eyesReactionId = await githubManager.createReaction(
      payload.comment.id,
      "eyes",
    );
    core.exportVariable("EYES_REACTION_ID", eyesReactionId?.toString() || "");

    const initialContent = `Starting Pochi execution...${githubManager.createGitHubActionFooter()}`;
    const progressCommentId = await githubManager.createComment(initialContent);
    core.exportVariable("PROGRESS_COMMENT_ID", progressCommentId.toString());

    console.log("Setup completed successfully");
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

setup();
