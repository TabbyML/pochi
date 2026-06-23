import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { deduplicateMessageParts } from "../trajectory-post-process";

// Minimal valid MessagePartLine – only fields MessagePartLine.safeParse checks
function messagePart(messageId: string, index: number, text = "content"): string {
  return JSON.stringify({
    type: "message-part",
    timestamp: new Date(),
    messageId,
    role: "assistant",
    index,
    part: { type: "text", text },
  });
}

// A non-MessagePartLine trajectory line
function metadataLine(messageId: string): string {
  return JSON.stringify({
    type: "message-metadata",
    messageId,
    role: "assistant",
    metadata: {},
  });
}

let tmpDir: string;
let filePath: string;

async function writeNdjson(lines: string[]): Promise<void> {
  await writeFile(filePath, lines.join("\n") + "\n");
}

async function readLines(): Promise<string[]> {
  const content = await readFile(filePath, "utf8");
  return content.split("\n").filter((l) => l.length > 0);
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "trajectory-post-process-"));
  filePath = join(tmpDir, "trajectory.ndjson");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("deduplicateMessageParts", () => {
  describe("no duplicates", () => {
    it("leaves a file with unique (messageId, index) pairs unchanged", async () => {
      const lines = [
        messagePart("msg-1", 0, "a"),
        messagePart("msg-1", 1, "b"),
        messagePart("msg-2", 0, "c"),
      ];
      await writeNdjson(lines);

      await deduplicateMessageParts(filePath);

      expect(await readLines()).toEqual(lines);
    });

    it("leaves an empty file unchanged", async () => {
      await writeFile(filePath, "");
      await deduplicateMessageParts(filePath);
      expect(await readFile(filePath, "utf8")).toBe("");
    });
  });

  describe("duplicate MessagePartLines", () => {
    it("keeps only the last occurrence of a duplicated (messageId, index)", async () => {
      const first = messagePart("msg-1", 0, "first");
      const second = messagePart("msg-1", 0, "second");
      const third = messagePart("msg-1", 0, "third");
      await writeNdjson([first, second, third]);

      await deduplicateMessageParts(filePath);

      const result = await readLines();
      expect(result).toHaveLength(1);
      expect(JSON.parse(result[0]).part.text).toBe("third");
    });

    it("keeps last occurrence per key independently when multiple keys are duplicated", async () => {
      const a1 = messagePart("msg-1", 0, "a1");
      const b1 = messagePart("msg-2", 0, "b1");
      const a2 = messagePart("msg-1", 0, "a2");
      const b2 = messagePart("msg-2", 0, "b2");
      await writeNdjson([a1, b1, a2, b2]);

      await deduplicateMessageParts(filePath);

      const result = await readLines();
      expect(result).toHaveLength(2);
      expect(JSON.parse(result[0]).part.text).toBe("a2");
      expect(JSON.parse(result[1]).part.text).toBe("b2");
    });

    it("preserves original order of surviving lines", async () => {
      const lines = [
        messagePart("msg-1", 0, "drop-me"),
        messagePart("msg-2", 0, "keep-A"),
        messagePart("msg-1", 0, "keep-B"),
        messagePart("msg-3", 0, "keep-C"),
      ];
      await writeNdjson(lines);

      await deduplicateMessageParts(filePath);

      const result = await readLines();
      expect(result).toHaveLength(3);
      expect(JSON.parse(result[0]).part.text).toBe("keep-A");
      expect(JSON.parse(result[1]).part.text).toBe("keep-B");
      expect(JSON.parse(result[2]).part.text).toBe("keep-C");
    });
  });

  describe("non-MessagePartLine lines", () => {
    it("always preserves non-MessagePartLine trajectory lines", async () => {
      const meta = metadataLine("msg-1");
      const part = messagePart("msg-1", 0, "hello");
      await writeNdjson([meta, part]);

      await deduplicateMessageParts(filePath);

      const result = await readLines();
      expect(result).toHaveLength(2);
      expect(JSON.parse(result[0]).type).toBe("message-metadata");
      expect(JSON.parse(result[1]).type).toBe("message-part");
    });

    it("preserves non-JSON lines as-is", async () => {
      const raw = "not valid json at all";
      const part = messagePart("msg-1", 0, "hello");
      await writeNdjson([raw, part]);

      await deduplicateMessageParts(filePath);

      const result = await readLines();
      expect(result).toHaveLength(2);
      expect(result[0]).toBe(raw);
    });

    it("preserves non-MessagePartLine lines interleaved with duplicates in correct order", async () => {
      const meta1 = metadataLine("msg-1");
      const part1 = messagePart("msg-1", 0, "v1");
      const meta2 = metadataLine("msg-2");
      const part2 = messagePart("msg-1", 0, "v2");
      await writeNdjson([meta1, part1, meta2, part2]);

      await deduplicateMessageParts(filePath);

      const result = await readLines();
      expect(result).toHaveLength(3);
      expect(JSON.parse(result[0]).type).toBe("message-metadata");
      expect(JSON.parse(result[0]).messageId).toBe("msg-1");
      expect(JSON.parse(result[1]).type).toBe("message-metadata");
      expect(JSON.parse(result[1]).messageId).toBe("msg-2");
      expect(JSON.parse(result[2]).part.text).toBe("v2");
    });
  });

  describe("edge cases", () => {
    it("handles a file with only non-JSON lines", async () => {
      const lines = ["# comment", "plain text", "another line"];
      await writeNdjson(lines);

      await deduplicateMessageParts(filePath);

      expect(await readLines()).toEqual(lines);
    });

    it("handles a single MessagePartLine with no duplicates", async () => {
      const line = messagePart("msg-1", 0);
      await writeNdjson([line]);

      await deduplicateMessageParts(filePath);

      expect(await readLines()).toEqual([line]);
    });

    it("writes result back to the same file path", async () => {
      await writeNdjson([messagePart("msg-1", 0, "v1"), messagePart("msg-1", 0, "v2")]);

      await deduplicateMessageParts(filePath);

      // File at the original path must exist and be correct
      const result = await readLines();
      expect(result).toHaveLength(1);
      expect(JSON.parse(result[0]).part.text).toBe("v2");
    });

    it("does not leave a .tmp file behind after success", async () => {
      await writeNdjson([messagePart("msg-1", 0, "v1"), messagePart("msg-1", 0, "v2")]);
      await deduplicateMessageParts(filePath);

      await expect(readFile(`${filePath}.tmp`, "utf8")).rejects.toThrow();
    });
  });
});
