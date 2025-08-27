import { spawn } from "node:child_process";
/**
 * Pochi runner utilities
 */
import { getPochiConfig } from "./environment";

interface PochiTaskResult {
  success: boolean;
  error?: string;
}

export async function runPochiTask(prompt: string): Promise<PochiTaskResult> {
  try {
    const config = getPochiConfig();

    const args = ["--prompt", prompt];

    // Only add model if specified
    if (config.model) {
      args.push("--model", config.model);
    }

    // Use pochi CLI from PATH (installed by action.yml) or POCHI_RUNNER env var
    const pochiRunner = process.env.POCHI_RUNNER || "pochi";

    // Execute pochi CLI
    const result = await new Promise<PochiTaskResult>((resolve) => {
      const child = spawn(pochiRunner, args, {
        stdio: [null, "inherit", "inherit"],
        cwd: process.cwd(),
        env: {
          ...process.env,
          POCHI_SESSION_TOKEN: config.token,
        },
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({
            success: false,
            error: `pochi CLI failed with code ${code}`,
          });
        }
      });

      child.on("error", (error) => {
        resolve({
          success: false,
          error: `Failed to spawn pochi CLI: ${error.message}`,
        });
      });
    });

    return result;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      error: `Failed to run pochi task: ${error}`,
    };
  }
}
