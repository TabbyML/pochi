import * as assert from "assert";
import { describe, it, beforeEach } from "mocha";
import { OutputTruncator } from "../output";
import { MaxTerminalOutputSize } from "@getpochi/common/tool-utils";

describe("OutputTruncator", () => {
  let truncator: OutputTruncator;

  beforeEach(() => {
    truncator = new OutputTruncator();
  });

  it("should truncate lines exceeding the maximum size", () => {
    // Create lines that will exceed the limit (MaxTerminalOutputSize is 500,000)
    const lines = [
      "a".repeat(130000), // 130000 bytes
      "b".repeat(130000), // 130000 bytes
      "c".repeat(130000), // 130000 bytes
      "d".repeat(130000), // 130000 bytes
    ];
    // Total: 520000 bytes (exceeds 500000)

    const result = truncator.truncateChunks(lines);

    // Should remove lines from the beginning until under limit
    assert.strictEqual(result.isTruncated, true);
    assert.ok(result.chunks.length < lines.length);

    // Verify the content size is under the limit
    const joinedContent = result.chunks.join("");
    const contentBytes = Buffer.byteLength(joinedContent, "utf8");
    assert.ok(contentBytes <= MaxTerminalOutputSize);
  });

  it("should not truncate when content is under limit", () => {
    const lines = [
      "short line 1",
      "short line 2",
      "short line 3",
    ];

    const result = truncator.truncateChunks(lines);

    assert.strictEqual(result.isTruncated, false);
    assert.deepStrictEqual(result.chunks, lines);
  });

  it("should handle empty lines array", () => {
    const result = truncator.truncateChunks([]);

    assert.strictEqual(result.isTruncated, false);
    assert.deepStrictEqual(result.chunks, []);
  });

  it("should handle single line that exceeds limit", () => {
    const lines = ["x".repeat(510000)]; // Single line exceeding limit (510000 > 500000)

    const result = truncator.truncateChunks(lines);

    // Should truncate the single line to fit within the limit
    assert.strictEqual(result.isTruncated, true);
    assert.strictEqual(result.chunks.length, 1);
    assert.ok(Buffer.byteLength(result.chunks[0], "utf8") <= MaxTerminalOutputSize);
  });

  it("should preserve the most recent lines when truncating", () => {
    const lines = [
      "oldest line",
      "middle line", 
      "newest line",
    ];
    
    // Force truncation by making lines large
    const largeLines = lines.map(line => line + "x".repeat(170000));

    const result = truncator.truncateChunks(largeLines);

    assert.strictEqual(result.isTruncated, true);
    // Should keep the newest (last) lines
    assert.ok(result.chunks[result.chunks.length - 1].includes("newest line"));
  });
});















