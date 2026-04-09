import { describe, expect, it } from "vitest";
import { checkStaleness, FileStateCache } from "../file-state-cache";

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
});
