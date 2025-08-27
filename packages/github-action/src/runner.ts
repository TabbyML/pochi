import { spawn } from "node:child_process";
import type { PromptFile } from "./types";
/**
 * Pochi runner manager
 */
import { getPochiConfig } from "./utils";

export interface PochiTaskOptions {
  prompt: string;
  files?: PromptFile[];
  cwd?: string;
}

export interface PochiTaskResult {
  output: string;
  success: boolean;
  error?: string;
}

export class PochiRunner {
  private config;

  constructor() {
    this.config = getPochiConfig();
  }

  private extractFinalOutput(rawOutput: string): string {
    // Remove ANSI color codes
    // biome-ignore lint/suspicious/noControlCharactersInRegex: <explanation>
    const cleanOutput = rawOutput.replace(/\x1b\[[0-9;]*m/g, "");

    // Split into lines and remove [stderr] prefix
    const lines = cleanOutput.split("\n").map((line) => {
      const trimmed = line.trim();
      return trimmed.replace(/^\[stderr\]\s*/, "");
    });

    // Find task completion and extract the completion message
    let taskCompletedIndex = -1;
    let completionContent = "";

    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes("Task Completed") || lines[i].includes("🎉")) {
        taskCompletedIndex = i;
        break;
      }
    }

    if (taskCompletedIndex >= 0) {
      // Look for the completion content after the task completed marker
      for (let i = taskCompletedIndex; i < lines.length; i++) {
        const line = lines[i];
        if (
          line &&
          !line.startsWith("💭 Thinking") &&
          !line.includes("DEBUG") &&
          !line.includes("storeId") &&
          !line.includes("debugInstanceId") &&
          !line.includes("Task link:")
        ) {
          // Extract the actual completion message from the "└─" format
          if (line.includes("└─")) {
            completionContent = line.replace(/.*└─\s*/, "").trim();
          } else if (
            !line.includes("🎉 Task Completed") &&
            (completionContent || line.trim().length > 10)
          ) {
            completionContent = line.trim();
          }
        }
      }

      if (completionContent) {
        return `${completionContent}`;
      }
    }

    return "Task completed successfully.";
  }

  async runTask(options: PochiTaskOptions): Promise<PochiTaskResult> {
    try {
      let fullPrompt = options.prompt;
      if (options.files && options.files.length > 0) {
        fullPrompt += "\n\nAttached files:\n";
        for (const file of options.files) {
          fullPrompt += `\n### ${file.filename}\n`;
          if (file.mime.startsWith("image/")) {
            fullPrompt += `[Image: ${file.filename}]\n`;
          } else {
            const content = Buffer.from(file.content, "base64").toString(
              "utf8",
            );
            fullPrompt += `\`\`\`\n${content}\n\`\`\`\n`;
          }
        }
      }

      const args = ["--prompt", fullPrompt];

      // Only add model if specified
      if (this.config.model) {
        args.push("--model", this.config.model);
      }

      // Use pochi CLI from PATH (installed by action.yml) or POCHI_RUNNER env var
      const pochiRunner = process.env.POCHI_RUNNER || "pochi";

      // Execute pochi CLI

      const result = await new Promise<PochiTaskResult>((resolve) => {
        const child = spawn(pochiRunner, args, {
          stdio: ["pipe", "pipe", "pipe"],
          cwd: process.cwd(),
          env: {
            ...process.env,
            POCHI_SESSION_TOKEN: this.config.token,
          },
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (data) => {
          const text = data.toString();
          stdout += text;
        });

        child.stderr?.on("data", (data) => {
          const text = data.toString();
          stderr += text;
        });

        child.on("close", (code) => {
          if (code === 0) {
            // Pochi CLI outputs to stderr, so prioritize stderr over stdout
            const rawOutput = stderr || stdout;
            // Extract the meaningful output from the raw output
            const output = this.extractFinalOutput(rawOutput);

            resolve({
              output: output || "Task completed successfully.",
              success: true,
            });
          } else {
            resolve({
              output: "",
              success: false,
              error: `pochi CLI failed with code ${code}:\n${stderr}`,
            });
          }
        });

        child.on("error", (error) => {
          resolve({
            output: "",
            success: false,
            error: `Failed to spawn pochi CLI: ${error.message}`,
          });
        });
      });

      return result;
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return {
        output: "",
        success: false,
        error: `Failed to run pochi task: ${error}`,
      };
    }
  }

  async summarizeContent(content: string): Promise<string> {
    try {
      const result = await this.runTask({
        prompt: `Summarize the following in less than 80 characters:\n\n${content}`,
      });

      if (result.success) {
        return result.output;
      }

      return "AI task completed";
    } catch (e) {
      return "Fix issue";
    }
  }
}
