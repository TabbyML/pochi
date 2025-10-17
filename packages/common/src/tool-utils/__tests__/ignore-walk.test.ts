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

  it("should respect useGitignore option", async () => {
    vi.mocked(fs.readFile).mockImplementation(async (path) => {
      if (path === "/workspace/.gitignore") {
        return "dir1";
      }
      return "";
    });

    // With useGitignore: false, dir1 should not be ignored
    const resultsNoGitignore = await ignoreWalk({ dir: "/workspace", useGitignore: false });
    expect(resultsNoGitignore.map((r) => r.relativePath)).toEqual([
      "file1.ts",
      "dir1",
      "dir1/file2.ts",
    ]);

    // With useGitignore: true (default), dir1 should be ignored
    const resultsWithGitignore = await ignoreWalk({ dir: "/workspace", useGitignore: true });
    expect(resultsWithGitignore.map((r) => r.relativePath)).toEqual(["file1.ts"]);
  });

  it("should respect usePochiignore option", async () => {
    vi.mocked(fs.readFile).mockImplementation(async (path) => {
      if (path === "/workspace/.pochiignore") {
        return "dir1";
      }
      return "";
    });

    // With usePochiignore: false, dir1 should not be ignored
    const resultsNoPochiignore = await ignoreWalk({ dir: "/workspace", usePochiignore: false });
    expect(resultsNoPochiignore.map((r) => r.relativePath)).toEqual([
      "file1.ts",
      "dir1",
      "dir1/file2.ts",
    ]);

    // With usePochiignore: true (default), dir1 should be ignored
    const resultsWithPochiignore = await ignoreWalk({ dir: "/workspace", usePochiignore: true });
    expect(resultsWithPochiignore.map((r) => r.relativePath)).toEqual(["file1.ts"]);
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

  it("should not accumulate ignore rules across sibling directories", async () => {
    // Test that ignore rules from one directory don't leak into sibling directories
    // This is a regression test for the bug where currentIg was mutated instead of cloned
    
    const testMockFs = {
      "/workspace": [
        createMockDirent("file1.ts", false),
        createMockDirent("dir1", true),
        createMockDirent("dir2", true),
      ],
      "/workspace/dir1": [
        createMockDirent("file-in-dir1.ts", false),
        createMockDirent("secret.txt", false),
      ],
      "/workspace/dir2": [
        createMockDirent("file-in-dir2.ts", false),
        createMockDirent("secret.txt", false), // Should NOT be ignored
      ],
    };

    // @ts-ignore
    vi.mocked(fs.readdir).mockImplementation(async (path) => {
      return testMockFs[path as keyof typeof testMockFs] || [];
    });

    vi.mocked(fs.readFile).mockImplementation(async (path) => {
      // Only dir1 has a .gitignore that ignores secret.txt
      if (path === "/workspace/dir1/.gitignore") {
        return "secret.txt";
      }
      return "";
    });

    const results = await ignoreWalk({ dir: "/workspace" });
    const relativePaths = results.map((r) => r.relativePath).sort();

    // secret.txt should be ignored in dir1 but NOT in dir2
    expect(relativePaths).toEqual([
      "dir1",
      "dir1/file-in-dir1.ts",
      "dir2",
      "dir2/file-in-dir2.ts",
      "dir2/secret.txt", // This should be present!
      "file1.ts",
    ]);
  });

  it("should not accumulate ignore rules across nested directories", async () => {
    // Test that ignore rules from parent directories are inherited correctly
    // but don't leak back to parent or accumulate incorrectly
    
    const testMockFs = {
      "/workspace": [
        createMockDirent("root.ts", false),
        createMockDirent("temp.log", false),
        createMockDirent("level1", true),
      ],
      "/workspace/level1": [
        createMockDirent("level1.ts", false),
        createMockDirent("temp.log", false),
        createMockDirent("build", true),
        createMockDirent("level2", true),
      ],
      "/workspace/level1/build": [
        createMockDirent("output.js", false),
      ],
      "/workspace/level1/level2": [
        createMockDirent("level2.ts", false),
        createMockDirent("build", true), // Different build dir
      ],
      "/workspace/level1/level2/build": [
        createMockDirent("output2.js", false),
      ],
    };

    // @ts-ignore
    vi.mocked(fs.readdir).mockImplementation(async (path) => {
      return testMockFs[path as keyof typeof testMockFs] || [];
    });

    vi.mocked(fs.readFile).mockImplementation(async (path) => {
      if (path === "/workspace/.gitignore") {
        return "temp.log";
      }
      if (path === "/workspace/level1/.gitignore") {
        return "build/";
      }
      return "";
    });

    const results = await ignoreWalk({ dir: "/workspace" });
    const relativePaths = results.map((r) => r.relativePath).sort();

    // Expected behavior:
    // - temp.log ignored everywhere (from root .gitignore)
    // - build/ in level1 ignored (from level1 .gitignore)
    // - build/ in level2 also ignored (inherits from level1 .gitignore)
    expect(relativePaths).toEqual([
      "level1",
      "level1/level1.ts",
      "level1/level2",
      "level1/level2/level2.ts",
      "root.ts",
    ]);

    // Ensure temp.log is not in results
    expect(relativePaths).not.toContain("temp.log");
    expect(relativePaths).not.toContain("level1/temp.log");
    
    // Ensure build directories are not in results
    expect(relativePaths).not.toContain("level1/build");
    expect(relativePaths).not.toContain("level1/level2/build");
  });

  it("should handle complex ignore rule inheritance correctly", async () => {
    // Test that each directory gets its own ignore context
    // without pollution from previously processed directories
    
    const testMockFs = {
      "/workspace": [
        createMockDirent("dirA", true),
        createMockDirent("dirB", true),
        createMockDirent("dirC", true),
      ],
      "/workspace/dirA": [
        createMockDirent("fileA.ts", false),
        createMockDirent("ignore-in-A.txt", false),
      ],
      "/workspace/dirB": [
        createMockDirent("fileB.ts", false),
        createMockDirent("ignore-in-A.txt", false), // Should NOT be ignored
        createMockDirent("ignore-in-B.txt", false),
      ],
      "/workspace/dirC": [
        createMockDirent("fileC.ts", false),
        createMockDirent("ignore-in-A.txt", false), // Should NOT be ignored
        createMockDirent("ignore-in-B.txt", false), // Should NOT be ignored
      ],
    };

    // @ts-ignore
    vi.mocked(fs.readdir).mockImplementation(async (path) => {
      return testMockFs[path as keyof typeof testMockFs] || [];
    });

    vi.mocked(fs.readFile).mockImplementation(async (path) => {
      if (path === "/workspace/dirA/.gitignore") {
        return "ignore-in-A.txt";
      }
      if (path === "/workspace/dirB/.gitignore") {
        return "ignore-in-B.txt";
      }
      // dirC has no .gitignore
      return "";
    });

    const results = await ignoreWalk({ dir: "/workspace" });
    const relativePaths = results.map((r) => r.relativePath).sort();

    // Each directory should have its own ignore rules
    // ignore-in-A.txt should only be ignored in dirA
    // ignore-in-B.txt should only be ignored in dirB
    expect(relativePaths).toEqual([
      "dirA",
      "dirA/fileA.ts",
      "dirB",
      "dirB/fileB.ts",
      "dirB/ignore-in-A.txt",
      "dirC",
      "dirC/fileC.ts",
      "dirC/ignore-in-A.txt",
      "dirC/ignore-in-B.txt",
    ]);
  });
});
