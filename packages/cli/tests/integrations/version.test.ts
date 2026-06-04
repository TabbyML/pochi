import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { run } from "../lib/run";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(__dirname, "../../dist/pochi");

describe("pochi --version", () => {
  it("should run in an empty directory", () => {
    const tmpDir = join(
      tmpdir(),
      `pochi-test-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tmpDir, { recursive: true });

    try {
      const cliExists = existsSync(CLI);
      const cliStat = cliExists ? statSync(CLI) : null;
      console.error("[probe] CLI path:", CLI);
      console.error("[probe] exists:", cliExists, "size:", cliStat?.size);
      console.error("[probe] mode:", cliStat?.mode.toString(8));
      if (cliExists && cliStat && cliStat.size < 64) {
        console.error(
          "[probe] head:",
          JSON.stringify(readFileSync(CLI, "utf8").slice(0, 200)),
        );
      }

      const { exitCode, stdout, stderr } = run(["--version"], { cwd: tmpDir });
      const stdoutStr = stdout.toString();
      const stderrStr = stderr.toString();
      console.error("[probe] exitCode:", exitCode);
      console.error("[probe] stdout:", JSON.stringify(stdoutStr));
      console.error("[probe] stderr:", JSON.stringify(stderrStr));
      expect(exitCode).toBe(0);
      expect(stdoutStr).toMatch(/^\d+\.\d+\.\d+/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
