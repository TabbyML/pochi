import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistPastedTextFiles } from "../pasted-text-files";

let tmpDir: string;

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return { ...actual, homedir: () => tmpDir };
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pochi-pasted-text-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("persistPastedTextFiles", () => {
  it("writes each pasted text under the local task directory", async () => {
    const [file] = await persistPastedTextFiles("task-1", [
      "first line\nfull pasted text",
    ]);

    expect(file.title).toBe("first line");
    expect(file.filePath).toMatch(
      /\.pochi\/tasks\/task-1\/pasted-texts\/pasted-text-[^/]+\.txt$/,
    );
    await expect(fs.readFile(file.filePath, "utf8")).resolves.toBe(
      "first line\nfull pasted text",
    );
  });
});
