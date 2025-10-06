import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ignoreWalk } from "../ignore-walk";

vi.mock("node:fs/promises");

describe("ignoreWalk", () => {
  const createMockDirent = (
    name: string,
    isDirectory: boolean,
  ): Dirent => ({
    name,
    isDirectory: () => isDirectory,
    isFile: () => !isDirectory,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    parentPath: "",
    path: "",
  });

  const mockFs = {
    "/workspace": [
      createMockDirent("file1.ts", false),
      createMockDirent("dir1", true),
      createMockDirent(".git", true),
    ],
    "/workspace/dir1": [createMockDirent("file2.ts", false)],
    "/workspace/.git": [createMockDirent("config", false)],
  };

  beforeEach(() => {
    // @ts-ignore
    vi.mocked(fs.readdir).mockImplementation(async (path) => {
      return mockFs[path as keyof typeof mockFs] || [];
    });
    vi.mocked(fs.readFile).mockResolvedValue("");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should walk files recursively and ignore .git", async () => {
    const results = await ignoreWalk({ dir: "/workspace" });

    expect(results.map((r) => r.relativePath)).toEqual([
      "file1.ts",
      "dir1",
      "dir1/file2.ts",
    ]);
  });

  it("should not walk recursively if disabled", async () => {
    const results = await ignoreWalk({ dir: "/workspace", recursive: false });

    expect(results.map((r) => r.relativePath)).toEqual(["file1.ts", "dir1"]);
  });

  it("should respect .gitignore rules", async () => {
    vi.mocked(fs.readFile).mockImplementation(async (path) => {
      if (path === "/workspace/.gitignore") {
        return "dir1";
      }
      return "";
    });

    const results = await ignoreWalk({ dir: "/workspace" });

    expect(results.map((r) => r.relativePath)).toEqual(["file1.ts"]);
  });

  it("should stop walking when abort signal is triggered", async () => {
    const abortController = new AbortController();
    const promise = ignoreWalk({
      dir: "/workspace",
      abortSignal: abortController.signal,
    });
    abortController.abort();
    const results = await promise;
    expect(results).toEqual([]);
  });

  it("should truncate results when MaxScanItems is reached", async () => {
    const largeDir = Array.from({ length: 10_001 }, (_, i) =>
      createMockDirent(`file${i}.ts`, false),
    );
    mockFs["/workspace"] = largeDir;
    const results = await ignoreWalk({ dir: "/workspace" });
    expect(results.length).toBe(10_000);
  });

  it("should handle readdir errors gracefully", async () => {
    vi.mocked(fs.readdir).mockRejectedValue(new Error("Permission denied"));
    const results = await ignoreWalk({ dir: "/workspace" });
    expect(results).toEqual([]);
  });
});
