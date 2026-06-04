import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../lib/run";

describe("pochi --version", () => {
  it("should run in an empty directory", () => {
    const tmpDir = join(
      tmpdir(),
      `pochi-test-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tmpDir, { recursive: true });

    try {
      const { exitCode, stdout, stderr } = run(["--version"], { cwd: tmpDir });
      if (exitCode !== 0) {
        console.error("stderr:", stderr.toString());
        console.error("stdout:", stdout.toString());
      }
      console.error("stdout:", stdout.toString());
      expect(exitCode).toBe(0);
      expect(stdout.toString()).toMatch(/^\d+\.\d+\.\d+/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
