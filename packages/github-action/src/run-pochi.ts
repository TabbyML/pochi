import { spawn } from "node:child_process";
import * as core from "@actions/core";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import { readPochiConfig } from "./env";
import type { GitHubManager } from "./github-manager";
import { buildBatchOutput } from "./output-utils";

export type RunPochiRequest = {
  prompt: string;
  event: IssueCommentCreatedEvent;
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
  const finalComment = `\`\`\`\n${truncatedOutput}\n\`\`\`${createGitHubActionFooter(request.event)}`;

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
      .addHeading("Pochi Report")
      .addHeading("🔧 Execution Details", 2)
      .addRaw(`${buildBatchOutput(context.outputBuffer)}\n\n`)
      .addRaw(
        `**[View Full GitHub Action](${getGitHubActionUrl(request.event)})**\n\n`,
      )
      .write();
  }
}

export async function runPochi(githubManager: GitHubManager): Promise<void> {
  // Parse the complete request from GitHubManager
  const request = githubManager.parseRequest();
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
      stdio: [null, "inherit", "pipe"], // Capture stderr only
      cwd: process.cwd(),
      env: {
        ...process.env,
        POCHI_CUSTOM_INSTRUCTIONS: instruction,
        POCHI_SESSION_TOKEN: config.token,
      },
    });

    // Capture stderr output (where pochi outputs its content)
    if (child.stderr) {
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (data: string) => {
        process.stderr.write(data); // Output to action logs
        context.outputBuffer += data; // Capture for summary
      });
    }

    // Update history comment every 15 seconds
    context.updateInterval = setInterval(async () => {
      try {
        const truncatedOutput = buildBatchOutput(context.outputBuffer);
        await githubManager.updateComment(historyCommentId, truncatedOutput);
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
  return `\n\n🔗 **[View GitHub Action](${actionUrl})**`;
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
