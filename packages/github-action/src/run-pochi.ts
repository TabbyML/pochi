import { spawn } from "node:child_process";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import { readPochiConfig } from "./env";
import type { GitHubManager } from "./github-manager";
import { buildBatchOutput } from "./output-utils";

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

  // Create initial history comment with GitHub Action link
  const initialComment = `Starting Pochi execution...${createGitHubActionFooter(request.event)}`;

  const historyCommentId = await githubManager.createComment(initialComment);

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

  // Execute pochi CLI with output capture
  await new Promise<void>((resolve, reject) => {
    let outputBuffer = "Starting Pochi execution...\n";
    let updateInterval: NodeJS.Timeout | null = null;

    const child = spawn(pochiCliPath, args, {
      stdio: [null, "inherit", "pipe"], // Capture stderr
      cwd: process.cwd(),
      env: {
        ...process.env,
        POCHI_CUSTOM_INSTRUCTIONS: instruction,
        POCHI_SESSION_TOKEN: config.token,
      },
    });

    // Capture stderr output
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (data: string) => {
        outputBuffer += data;
      });
    }

    // Update history comment every 10 seconds
    updateInterval = setInterval(async () => {
      const truncatedOutput = buildBatchOutput(outputBuffer);
      await githubManager.updateComment(historyCommentId, truncatedOutput);
    }, 10000);

    let handled = false;
    const handleFailure = async (error: Error) => {
      if (handled) return;
      handled = true;

      // Clear update interval
      if (updateInterval) {
        clearInterval(updateInterval);
      }

      // Finalize history comment with failure status
      const truncatedOutput = buildBatchOutput(outputBuffer);
      const finalComment = `${truncatedOutput}${createGitHubActionFooter(request.event)}`;
      await githubManager.finalizeComment(
        historyCommentId,
        finalComment,
        false,
      );

      await githubManager.createReaction(request.commentId, "-1");
      if (eyesReactionId) {
        await githubManager.deleteReaction(request.commentId, eyesReactionId);
      }
      reject(error);
    };

    child.on("close", async (code) => {
      if (handled) return;

      // Clear update interval
      if (updateInterval) {
        clearInterval(updateInterval);
      }

      if (code === 0) {
        handled = true;

        // Final update of history comment with success status
        const truncatedOutput = buildBatchOutput(outputBuffer);
        const finalComment = `${truncatedOutput}${createGitHubActionFooter(request.event)}`;
        await githubManager.finalizeComment(
          historyCommentId,
          finalComment,
          true,
        );

        // Add rocket reaction to indicate completion
        await githubManager.createReaction(request.commentId, "rocket");
        if (eyesReactionId) {
          await githubManager.deleteReaction(request.commentId, eyesReactionId);
        }
        resolve();
      } else {
        outputBuffer += `\nProcess exited with code ${code}`;
        handleFailure(new Error(`pochi CLI failed with code ${code}`));
      }
    });

    child.on("error", (error) => {
      handleFailure(new Error(`Failed to spawn pochi CLI: ${error.message}`));
    });
  });
}

function getGitHubActionUrl(event: RunPochiRequest["event"]): string {
  const runId = process.env.GITHUB_RUN_ID;
  const { owner, name: repoName } = event.repository;

  if (!runId) {
    // Fallback to actions page if run ID is not available
    return `https://github.com/${owner.login}/${repoName}/actions`;
  }

  return `https://github.com/${owner.login}/${repoName}/actions/runs/${runId}`;
}

function createGitHubActionFooter(event: RunPochiRequest["event"]): string {
  const actionUrl = getGitHubActionUrl(event);
  return `\n\n🔗 **[View GitHub Action Execution](${actionUrl})**`;
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
