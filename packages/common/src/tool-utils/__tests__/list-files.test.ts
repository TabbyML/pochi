import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileResult, IgnoreWalkOptions } from "../ignore-walk";
import { listFiles, listWorkspaceFiles } from "../list-files";

const ignoreWalkMock = vi.hoisted(() =>
  vi.fn<(options: IgnoreWalkOptions) => Promise<FileResult[]>>(),
);

vi.mock("../ignore-walk", () => ({
  ignoreWalk: ignoreWalkMock,
}));

const fakedCwd = path.resolve("/faked");

const createMockFiles = (count: number): FileResult[] => {
  return Array.from({ length: count }, (_, i) => ({
    filepath: path.join(fakedCwd, `file${i}.txt`),
    isDir: false,
    relativePath: `file${i}.txt`,
  }));
};

describe("listFiles", () => {
  beforeEach(() => {
    ignoreWalkMock.mockResolvedValue(createMockFiles(10));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should list files in a directory", async () => {
    const result = await listFiles({
      cwd: fakedCwd,
      path: ".",
    });
    expect(result.files).toHaveLength(10);
    expect(result.isTruncated).toBe(false);
    expect(ignoreWalkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: fakedCwd,
        recursive: false,
      }),
    );
  });

  it("should handle recursive listing", async () => {
    await listFiles({
      cwd: fakedCwd,
      path: ".",
      recursive: true,
    });
    expect(ignoreWalkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recursive: true,
      }),
    );
  });

  it("should truncate results when exceeding max limit", async () => {
    ignoreWalkMock.mockResolvedValue(createMockFiles(1501));
    const result = await listFiles({
      cwd: fakedCwd,
      path: ".",
    });
    expect(result.files).toHaveLength(1500);
    expect(result.isTruncated).toBe(true);
  });

  it("should truncate results when exceeding maxCharLength limit", async () => {
    ignoreWalkMock.mockResolvedValue([
      { filepath: path.join(fakedCwd, "verylongfilename1.txt"), isDir: false, relativePath: "verylongfilename1.txt" },
      { filepath: path.join(fakedCwd, "verylongfilename2.txt"), isDir: false, relativePath: "verylongfilename2.txt" },
    ]);
    const result = await listFiles({
      cwd: fakedCwd,
      path: ".",
      maxCharLength: 25, // only first file (length 22) fits, second file will exceed 25 limit
    });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toBe("verylongfilename1.txt");
    expect(result.isTruncated).toBe(true);
  });

  it("should throw an error when ignoreWalk fails", async () => {
    ignoreWalkMock.mockRejectedValue(new Error("Failed to walk"));
    await expect(
      listFiles({
        cwd: fakedCwd,
        path: ".",
      }),
    ).rejects.toThrow("Failed to list files: Failed to walk");
  });
});

describe("listWorkspaceFiles", () => {
  beforeEach(() => {
    ignoreWalkMock.mockResolvedValue(createMockFiles(20));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should list all files in the workspace recursively by default", async () => {
    const result = await listWorkspaceFiles({ cwd: fakedCwd });
    expect(result.files).toHaveLength(20);
    expect(result.isTruncated).toBe(false);
    expect(ignoreWalkMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dir: fakedCwd,
        recursive: true,
      }),
    );
  });

  it("should respect the maxItems option", async () => {
    const result = await listWorkspaceFiles({ cwd: fakedCwd, maxItems: 15 });
    expect(result.files).toHaveLength(15);
    expect(result.isTruncated).toBe(true);
  });

  it("should respect the maxCharLength option", async () => {
    ignoreWalkMock.mockResolvedValue([
      { filepath: path.join(fakedCwd, "file1.txt"), isDir: false, relativePath: "file1.txt" },
      { filepath: path.join(fakedCwd, "file2.txt"), isDir: false, relativePath: "file2.txt" },
    ]);
    const result = await listWorkspaceFiles({
      cwd: fakedCwd,
      maxCharLength: 10, // only first file (length 9) fits
    });
    expect(result.files).toHaveLength(1);
    expect(result.files[0]).toBe("file1.txt");
    expect(result.isTruncated).toBe(true);
  });

  it("should return an empty result when ignoreWalk fails", async () => {
    ignoreWalkMock.mockRejectedValue(new Error("Access denied"));
    const result = await listWorkspaceFiles({ cwd: fakedCwd });
    expect(result.files).toEqual([]);
    expect(result.isTruncated).toBe(false);
  });
});
