import { spawn } from "node:child_process";
import type { IssueCommentCreatedEvent } from "@octokit/webhooks-types";
import { readPochiConfig } from "./env";

export type RunPochiRequest = {
  prompt: string;
  event: Omit<IssueCommentCreatedEvent, "comment">;
};

export async function runPochi(request: RunPochiRequest): Promise<void> {
  const config = readPochiConfig();

  const args = ["--prompt", request.prompt];

  // Only add model if specified
  if (config.model) {
    args.push("--model", config.model);
  }

  // Use pochi CLI from PATH (installed by action.yml) or env var
  const pochiCliPath = process.env.POCHI_CLI_PATH || "pochi";

  // Execute pochi CLI
  await new Promise<void>((resolve, reject) => {
    const child = spawn(pochiCliPath, args, {
      stdio: [null, "inherit", "inherit"],
      cwd: process.cwd(),
      env: {
        ...process.env,
        POCHI_CUSTOM_INSTRUCTIONS: formatCustomInstruction(request.event),
        POCHI_SESSION_TOKEN: config.token,
      },
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`pochi CLI failed with code ${code}`));
      }
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to spawn pochi CLI: ${error.message}`));
    });
  });
}

function formatCustomInstruction(event: RunPochiRequest["event"]) {
  return `## Event triggering this task\n${JSON.stringify(event, null, 2)}`;
}
