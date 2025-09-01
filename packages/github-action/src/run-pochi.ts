import { spawn } from "node:child_process";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import { readPochiConfig } from "./env";
import type { GitHubManager } from "./github-manager";

export type RunPochiRequest = {
  prompt: string;
  event: Omit<IssueCommentCreatedEvent, "comment">;
  commentId: number;
};

export async function runPochi(
  request: RunPochiRequest,
  githubManager: GitHubManager,
): Promise<void> {
  const config = readPochiConfig();

  // Add eye reaction to indicate starting
  const eyesReactionId = await githubManager.createReaction(
    request.commentId,
    "eyes",
  );

  const args = ["--prompt", request.prompt, "--max-steps", "128"];

  // Only add model if specified
  if (config.model) {
    args.push("--model", config.model);
  }

  // Use pochi CLI from PATH (installed by action.yml) or env var
  const pochiCliPath = process.env.POCHI_CLI_PATH || "pochi";

  const instruction = formatCustomInstruction(request.event);
  if (process.env.POCHI_GITHUB_ACTION_DEBUG) {
    console.log(`Starting pochi CLI with custom instruction\n\n${instruction}`);
  }

  // Execute pochi CLI
  await new Promise<void>((resolve, reject) => {
    const child = spawn(pochiCliPath, args, {
      stdio: [null, "inherit", "inherit"],
      cwd: process.cwd(),
      env: {
        ...process.env,
        POCHI_CUSTOM_INSTRUCTIONS: instruction,
        POCHI_SESSION_TOKEN: config.token,
      },
    });

    let handled = false;
    const handleFailure = async (error: Error) => {
      if (handled) return;
      handled = true;
      await githubManager.createReaction(request.commentId, "-1");
      if (eyesReactionId) {
        await githubManager.deleteReaction(request.commentId, eyesReactionId);
      }
      reject(error);
    };

    child.on("close", async (code) => {
      if (handled) return;
      if (code === 0) {
        handled = true;
        // Add rocket reaction to indicate completion
        await githubManager.createReaction(request.commentId, "rocket");
        if (eyesReactionId) {
          await githubManager.deleteReaction(request.commentId, eyesReactionId);
        }
        resolve();
      } else {
        handleFailure(new Error(`pochi CLI failed with code ${code}`));
      }
    });

    child.on("error", (error) => {
      handleFailure(new Error(`Failed to spawn pochi CLI: ${error.message}`));
    });
  });
}

function formatCustomInstruction(event: RunPochiRequest["event"]) {
  return `## Instruction

This task is triggered in an Github Action Workflow. Please follow user's prompt, perform the task.
In the end, please always use "gh" command to reply the comment that triggered this task, and explain what you have done.

## Event triggering this task

${JSON.stringify(event, null, 2)}


## Additional Notes
* If this event has a corresponding PR, always checkout the PR branch first (use gh)

`.trim();
}
