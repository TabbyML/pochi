import { spawn } from "node:child_process";
import * as core from "@actions/core";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import { readPochiConfig } from "./env";
import type { GitHubManager } from "./github-manager";
import { buildBatchOutput } from "./output-utils";

export type RunPochiRequest = {
  prompt: string;
  event: Omit<IssueCommentCreatedEvent, "comment">;
  commentId: number;
};

// Helper types for execution context
interface ExecutionContext {
  outputBuffer: string;
  updateInterval: NodeJS.Timeout | null;
  handled: boolean;
  historyCommentId: number;
  eyesReactionId: number | undefined;
}

// Extract cleanup and finalization logic
async function cleanupExecution(
  context: ExecutionContext,
  githubManager: GitHubManager,
  request: RunPochiRequest,
  success: boolean,
  reaction: "rocket" | "-1",
): Promise<void> {
  if (context.handled) return;
  context.handled = true;

  // Clear update interval safely
  if (context.updateInterval) {
    clearInterval(context.updateInterval);
    context.updateInterval = null;
  }

  // Finalize history comment
  const truncatedOutput = buildBatchOutput(context.outputBuffer);
  const finalComment = `\`\`\`\n${truncatedOutput}\n\`\`\`${githubManager.createGitHubActionFooter()}`;

  await githubManager.finalizeComment(
    context.historyCommentId,
    finalComment,
    success,
  );

  // Handle reactions
  await githubManager.createReaction(request.commentId, reaction);
  if (context.eyesReactionId) {
    await githubManager.deleteReaction(
      request.commentId,
      context.eyesReactionId,
    );
  }

  if (context.outputBuffer.trim()) {
    await core.summary
      .addHeading("Task Details")
      .addCodeBlock(buildBatchOutput(context.outputBuffer), "text")
      .addRaw(
        `**[View Full GitHub Action](${githubManager.createGitHubActionFooter().match(/\[View GitHub Action\]\((.*?)\)/)?.[1] || "#"})**\n\n`,
      )
      .write();
  }
}

export async function runPochi(githubManager: GitHubManager): Promise<void> {
  // Parse the complete request from GitHubManager
  const request = githubManager.parseRequest();
  const config = readPochiConfig();

  const historyCommentId = process.env.PROGRESS_COMMENT_ID
    ? Number.parseInt(process.env.PROGRESS_COMMENT_ID, 10)
    : await githubManager.createComment(
        `Starting Pochi execution...${githubManager.createGitHubActionFooter()}`,
      );
  const eyesReactionId = process.env.EYES_REACTION_ID
    ? Number.parseInt(process.env.EYES_REACTION_ID, 10)
    : undefined;

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

  const context: ExecutionContext = {
    outputBuffer: "Starting Pochi execution...\n",
    updateInterval: null,
    handled: false,
    historyCommentId,
    eyesReactionId,
  };

  // Execute pochi CLI with output capture
  await new Promise<void>((resolve, reject) => {
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
        context.outputBuffer += data;
      });
    }

    // Update history comment every 15 seconds
    context.updateInterval = setInterval(async () => {
      try {
        const truncatedOutput = buildBatchOutput(context.outputBuffer);
        const progressContent = `\`\`\`\n${truncatedOutput}\n\`\`\`${githubManager.createGitHubActionFooter()}`;
        await githubManager.updateComment(historyCommentId, progressContent);
      } catch (error) {
        console.error("Failed to update comment:", error);
      }
    }, 15000);

    const handleFailure = async (error: Error) => {
      await cleanupExecution(context, githubManager, request, false, "-1");
      reject(error);
    };

    const handleSuccess = async () => {
      await cleanupExecution(context, githubManager, request, true, "rocket");
      resolve();
    };

    child.on("close", async (code) => {
      if (context.handled) return;

      if (code === 0) {
        await handleSuccess();
      } else {
        context.outputBuffer += `\nProcess exited with code ${code}`;
        await handleFailure(new Error(`pochi CLI failed with code ${code}`));
      }
    });

    child.on("error", async (error) => {
      await handleFailure(
        new Error(`Failed to spawn pochi CLI: ${error.message}`),
      );
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
