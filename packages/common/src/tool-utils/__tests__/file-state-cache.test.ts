import { describe, expect, it } from "vitest";
import { FileStateCache } from "../file-state-cache";

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
});
