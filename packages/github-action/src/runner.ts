import { spawn } from "node:child_process";
/**
 * Pochi runner utilities
 */
import { getPochiConfig } from "./environment";

export async function runPochiTask(prompt: string): Promise<void> {
  const config = getPochiConfig();

  const args = ["--prompt", prompt];

  // Only add model if specified
  if (config.model) {
    args.push("--model", config.model);
  }

  // Use pochi CLI from PATH (installed by action.yml) or POCHI_RUNNER env var
  const pochiRunner = process.env.POCHI_RUNNER || "pochi";

  // Execute pochi CLI
  await new Promise<void>((resolve, reject) => {
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
