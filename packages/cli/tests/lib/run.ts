import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "../../dist/pochi");

export function run(
  args: string[],
  opts: {
    cwd?: string;
    input?: string;
    env?: Record<string, string>;
  } = {},
) {
  const result = spawnSync(CLI, args, {
    cwd: opts.cwd,
    input: opts.input,
    stdio: [opts.input ? "pipe" : "ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...opts.env,
    },
  });

  if (result.error) {
    throw result.error;
  }

  return {
    exitCode: result.status,
    stdout: result.stdout || Buffer.alloc(0),
    stderr: result.stderr || Buffer.alloc(0),
  };
}
