import { describe, expect, it } from "vitest";
import {
  checkStaleness,
  FileStateCache,
  withFileStateCacheGuard,
} from "../file-state-cache";

describe("FileStateCache", () => {
  it("skips caching entries larger than the configured byte limit", () => {
    const cache = new FileStateCache();
    const oversizedContent = "a".repeat(25 * 1024 * 1024 + 1);

    cache.set("/tmp/large.txt", {
      content: oversizedContent,
      timestamp: 1,
      startLine: 1,
      endLine: 1,
    });

    expect(cache.has("/tmp/large.txt")).toBe(false);
    expect(cache.size).toBe(0);
    expect(cache.sizeBytes).toBe(0);
  });

  it("drops the previous entry when a replacement becomes oversized", () => {
    const cache = new FileStateCache();
    const oversizedContent = "a".repeat(25 * 1024 * 1024 + 1);

    cache.set("/tmp/file.txt", {
      content: "1234",
      timestamp: 1,
      startLine: 1,
      endLine: 1,
    });
    cache.set("/tmp/file.txt", {
      content: oversizedContent,
      timestamp: 2,
      startLine: 1,
      endLine: 2,
    });

    expect(cache.has("/tmp/file.txt")).toBe(false);
    expect(cache.size).toBe(0);
    expect(cache.sizeBytes).toBe(0);
  });

  it("treats deleted files as stale", async () => {
    const cache = new FileStateCache();
    cache.set("/tmp/file.txt", {
      content: "hello",
      timestamp: 1,
      startLine: 1,
      endLine: 1,
    });

    await expect(
      checkStaleness(cache, "/tmp/file.txt", async () => undefined, "writing"),
    ).rejects.toThrow(
      "File has been modified since it was last read (expected mtime 1, got missing). Please read the file again before writing.",
    );
  });

  it("allows edits when the mtime still matches the cached state", async () => {
    const cache = new FileStateCache();
    cache.set("/tmp/file.txt", {
      content: "hello",
      timestamp: 1,
      startLine: 1,
      endLine: 1,
    });

    await expect(
      checkStaleness(cache, "/tmp/file.txt", async () => 1, "editing"),
    ).resolves.toBeUndefined();
  });

  it("throws when editing a file that was never read but exists on disk", async () => {
    const cache = new FileStateCache();

    await expect(
      checkStaleness(cache, "/tmp/file.txt", async () => 1234, "editing"),
    ).rejects.toThrow(
      "File has not been read yet. Please read the file before editing it.",
    );
  });

  it("throws when writing a file that was never read but exists on disk", async () => {
    const cache = new FileStateCache();

    await expect(
      checkStaleness(cache, "/tmp/file.txt", async () => 1234, "writing"),
    ).rejects.toThrow(
      "File has not been read yet. Please read the file before writing it.",
    );
  });

  it("allows writing a new file that does not exist on disk and was never read", async () => {
    const cache = new FileStateCache();

    // getMtime returns undefined => file does not exist
    await expect(
      checkStaleness(cache, "/tmp/new-file.txt", async () => undefined, "writing"),
    ).resolves.toBeUndefined();
  });

  it("returns recent files in LRU order", () => {
    const cache = new FileStateCache();
    cache.set("/tmp/a.txt", {
      content: "a",
      timestamp: 1,
      startLine: 1,
      endLine: 1,
      isTruncated: true,
    });
    cache.set("/tmp/b.txt", {
      content: "b",
      timestamp: 2,
      startLine: 1,
      endLine: 1,
    });
    cache.set("/tmp/c.txt", {
      content: "c",
      timestamp: 3,
      startLine: 1,
      endLine: 1,
    });

    cache.get("/tmp/a.txt");

    expect(cache.getRecentFiles(2).map((file) => file.path)).toEqual([
      "/tmp/a.txt",
      "/tmp/c.txt",
    ]);
    expect(cache.getRecentFiles(1)[0]?.isTruncated).toBe(true);
  });
});

describe("withFileStateCacheGuard", () => {
  it("throws when editing an existing file that was never read", async () => {
    const cache = new FileStateCache();
    const getMtime = async (_path: string) => 1000;

    await expect(
      withFileStateCacheGuard({
        cache,
        path: "/tmp/existing.txt",
        cwd: "/tmp",
        getMtime,
        operation: "editing",
        doWork: async () => ({
          result: { success: true as const },
          fileCacheContent: "new content",
        }),
      }),
    ).rejects.toThrow(
      "File has not been read yet. Please read the file before editing it.",
    );
  });

  it("allows writing a brand-new file that does not yet exist on disk", async () => {
    const cache = new FileStateCache();
    // getMtime returns undefined => file does not exist
    const getMtime = async (_path: string) => undefined;

    await expect(
      withFileStateCacheGuard({
        cache,
        path: "/tmp/brand-new.txt",
        cwd: "/tmp",
        getMtime,
        operation: "writing",
        doWork: async () => ({
          result: { success: true as const },
          fileCacheContent: "hello",
        }),
      }),
    ).resolves.toEqual({ success: true });
  });
});
