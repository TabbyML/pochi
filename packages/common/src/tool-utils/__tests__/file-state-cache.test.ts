import { describe, expect, it } from "vitest";
import {
  checkStaleness,
  FileStateCache,
  withFileStateCacheGuard,
  withReadFileCache,
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

  // The staleness guard treats a file whose mtime no longer matches (including
  // a deleted file) as stale and requires a re-read.
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
    ).rejects.toThrow("File has been modified since it was last read");
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

  // The "read before edit/write" guard requires the file to have been read
  // first when it exists on disk.
  it("throws when editing a file that was never read but exists on disk", async () => {
    const cache = new FileStateCache();

    await expect(
      checkStaleness(cache, "/tmp/file.txt", async () => 1234, "editing"),
    ).rejects.toThrow("File has not been read yet");
  });

  it("throws when writing a file that was never read but exists on disk", async () => {
    const cache = new FileStateCache();

    await expect(
      checkStaleness(cache, "/tmp/file.txt", async () => 1234, "writing"),
    ).rejects.toThrow("File has not been read yet");
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

  // markAllAsWritten is used when the read tool_results that populated the
  // cache leave the conversation (compaction / retry-strip). It must retain
  // the entries (so edits are not falsely rejected) while disabling dedup.
  it("keeps entries editable but stops read dedup after markAllAsWritten", async () => {
    const cache = new FileStateCache();
    cache.set("/tmp/file.txt", {
      content: "hello",
      timestamp: 1,
      startLine: 1,
      endLine: 1,
    });

    cache.markAllAsWritten();

    // Entry is retained and downgraded to a write-sourced state.
    expect(cache.get("/tmp/file.txt")?.fromWrite).toBe(true);

    // Editing an already-read file is still allowed (no false "not read").
    await expect(
      checkStaleness(cache, "/tmp/file.txt", async () => 1, "editing"),
    ).resolves.toBeUndefined();

    // A re-read of the same range is no longer deduplicated, so it cannot
    // dangle onto a tool_result that left the conversation.
    const result = await withReadFileCache({
      cache,
      path: "/tmp/file.txt",
      cwd: "/tmp",
      startLine: 1,
      endLine: 1,
      getMtime: async () => 1,
      doRead: async () => ({
        result: { content: "hello" },
        fileCacheContent: "hello",
      }),
    });
    expect(result).toEqual({
      result: { content: "hello" },
      deduplicated: false,
    });
  });
});

describe("withFileStateCacheGuard", () => {
  // The "read before edit/write" guard rejects editing an existing file that
  // was never read.
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
    ).rejects.toThrow("File has not been read yet");
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
