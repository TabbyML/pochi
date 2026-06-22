import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseTrajectoryFile } from "../trajectory-parser";

// ── helpers ──────────────────────────────────────────────────────────────────

function messagePartLine(
  messageId: string,
  index: number,
  text: string,
  role: "user" | "assistant" = "user",
  taskId?: string,
): string {
  return JSON.stringify({
    type: "message-part",
    timestamp: new Date().toISOString(),
    ...(taskId ? { taskId } : {}),
    messageId,
    role,
    index,
    part: { type: "text", text },
  });
}

function messageMetadataLine(
  messageId: string,
  role: "user" | "assistant" = "user",
  metadata: Record<string, unknown> = { kind: "user" },
): string {
  return JSON.stringify({
    type: "message-metadata",
    messageId,
    role,
    metadata,
  });
}

function filesLine(files: unknown[] = []): string {
  return JSON.stringify({ type: "files", files });
}

// ── fixture ───────────────────────────────────────────────────────────────────

let tmpDir: string;
let filePath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "trajectory-parser-"));
  filePath = join(tmpDir, "trajectory.ndjson");
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeLines(lines: string[]): Promise<void> {
  await writeFile(filePath, lines.join("\n") + "\n");
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("parseTrajectoryFile", () => {
  describe("missing / empty file", () => {
    it("returns empty result when the file does not exist", async () => {
      const result = await parseTrajectoryFile(join(tmpDir, "nonexistent.ndjson"));
      expect(result).toEqual({ fingerprints: [], mainTask: [], subTasks: {}, files: [] });
    });

    it("returns empty result for a file with only blank lines", async () => {
      await writeFile(filePath, "\n\n\n");
      const result = await parseTrajectoryFile(filePath);
      expect(result).toEqual({ fingerprints: [], mainTask: [], subTasks: {}, files: [] });
    });

    it("skips lines that are not valid JSON", async () => {
      await writeLines(["not json", messagePartLine("msg-1", 0, "hello"), "also bad"]);
      const result = await parseTrajectoryFile(filePath);
      expect(result.mainTask).toHaveLength(1);
    });

    it("skips lines that fail TrajectoryLine schema validation", async () => {
      const badLine = JSON.stringify({ type: "unknown-type", foo: "bar" });
      await writeLines([badLine, messagePartLine("msg-1", 0, "hello")]);
      const result = await parseTrajectoryFile(filePath);
      expect(result.mainTask).toHaveLength(1);
    });
  });

  describe("main task (no taskId)", () => {
    it("assembles a single message from its parts in order", async () => {
      await writeLines([
        messagePartLine("msg-1", 0, "hello"),
        messagePartLine("msg-1", 1, " world"),
      ]);
      const { mainTask } = await parseTrajectoryFile(filePath);
      expect(mainTask).toHaveLength(1);
      expect(mainTask[0]).toMatchObject({
        id: "msg-1",
        role: "user",
        parts: [
          { type: "text", text: "hello" },
          { type: "text", text: " world" },
        ],
      });
    });

    it("preserves message insertion order across multiple messages", async () => {
      await writeLines([
        messagePartLine("msg-1", 0, "first", "user"),
        messagePartLine("msg-2", 0, "second", "assistant"),
        messagePartLine("msg-3", 0, "third", "user"),
      ]);
      const { mainTask } = await parseTrajectoryFile(filePath);
      expect(mainTask.map((m) => m.id)).toEqual(["msg-1", "msg-2", "msg-3"]);
    });

    it("handles out-of-order part indices and assembles them correctly", async () => {
      await writeLines([
        messagePartLine("msg-1", 2, "third"),
        messagePartLine("msg-1", 0, "first"),
        messagePartLine("msg-1", 1, "second"),
      ]);
      const { mainTask } = await parseTrajectoryFile(filePath);
      expect(mainTask[0].parts).toEqual([
        { type: "text", text: "first" },
        { type: "text", text: "second" },
        { type: "text", text: "third" },
      ]);
    });

    it("overwrites an earlier part when the same (messageId, index) appears twice", async () => {
      await writeLines([
        messagePartLine("msg-1", 0, "original"),
        messagePartLine("msg-1", 0, "updated"),
      ]);
      const { mainTask } = await parseTrajectoryFile(filePath);
      expect(mainTask[0].parts[0]).toEqual({ type: "text", text: "updated" });
    });

    it("attaches metadata to the correct message", async () => {
      const meta = { kind: "user", compact: true };
      await writeLines([
        messagePartLine("msg-1", 0, "hello"),
        messageMetadataLine("msg-1", "user", meta),
      ]);
      const { mainTask } = await parseTrajectoryFile(filePath);
      expect(mainTask[0].metadata).toEqual(meta);
    });

    it("does not add a metadata key when no metadata line is present", async () => {
      await writeLines([messagePartLine("msg-1", 0, "hello")]);
      const { mainTask } = await parseTrajectoryFile(filePath);
      expect(mainTask[0]).not.toHaveProperty("metadata");
    });

    it("attaches metadata even when the metadata line appears before the message parts", async () => {
      const meta = { kind: "user" };
      await writeLines([
        messageMetadataLine("msg-1", "user", meta),
        messagePartLine("msg-1", 0, "hello"),
      ]);
      const { mainTask } = await parseTrajectoryFile(filePath);
      expect(mainTask[0].metadata).toEqual(meta);
    });

    it("filters out sparse (undefined) part slots from the assembled message", async () => {
      // Part at index 1 is written; index 0 is never written → should not appear
      await writeLines([messagePartLine("msg-1", 1, "only-part")]);
      const { mainTask } = await parseTrajectoryFile(filePath);
      // The undefined slot at index 0 must be filtered out
      expect(mainTask[0].parts.every((p) => p !== undefined)).toBe(true);
    });
  });

  describe("sub tasks (with taskId)", () => {
    it("routes messages with a taskId to the correct subTask bucket", async () => {
      await writeLines([
        messagePartLine("msg-1", 0, "main", "user"),
        messagePartLine("sub-msg-1", 0, "subtask", "assistant", "task-A"),
      ]);
      const { mainTask, subTasks } = await parseTrajectoryFile(filePath);
      expect(mainTask).toHaveLength(1);
      expect(mainTask[0].id).toBe("msg-1");
      expect(subTasks["task-A"]).toHaveLength(1);
      expect(subTasks["task-A"][0].id).toBe("sub-msg-1");
    });

    it("keeps separate sub task buckets for different taskIds", async () => {
      await writeLines([
        messagePartLine("msg-A", 0, "from A", "assistant", "task-A"),
        messagePartLine("msg-B", 0, "from B", "assistant", "task-B"),
      ]);
      const { subTasks } = await parseTrajectoryFile(filePath);
      expect(Object.keys(subTasks)).toHaveLength(2);
      expect(subTasks["task-A"][0].id).toBe("msg-A");
      expect(subTasks["task-B"][0].id).toBe("msg-B");
    });

    it("attaches metadata to a sub-task message", async () => {
      const meta = { kind: "assistant", totalTokens: 42, finishReason: "stop", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString() };
      await writeLines([
        messagePartLine("sub-msg-1", 0, "hello", "assistant", "task-A"),
        JSON.stringify({ type: "message-metadata", messageId: "sub-msg-1", role: "assistant", metadata: meta }),
      ]);
      const { subTasks } = await parseTrajectoryFile(filePath);
      expect(subTasks["task-A"][0].metadata).toMatchObject({ kind: "assistant" });
    });

    it("returns an empty subTasks object when no taskId lines are present", async () => {
      await writeLines([messagePartLine("msg-1", 0, "hello")]);
      const { subTasks } = await parseTrajectoryFile(filePath);
      expect(subTasks).toEqual({});
    });
  });

  describe("files lines", () => {
    it("collects files from a files line", async () => {
      const file = { name: "foo.ts", content: "export const x = 1;" };
      await writeLines([filesLine([file])]);
      const { files } = await parseTrajectoryFile(filePath);
      expect(files).toHaveLength(1);
      expect(files[0]).toEqual(file);
    });

    it("accumulates files from multiple files lines", async () => {
      const file1 = { name: "a.ts", content: "a" };
      const file2 = { name: "b.ts", content: "b" };
      await writeLines([filesLine([file1]), filesLine([file2])]);
      const { files } = await parseTrajectoryFile(filePath);
      expect(files).toHaveLength(2);
    });

    it("returns an empty files array when no files lines are present", async () => {
      await writeLines([messagePartLine("msg-1", 0, "hello")]);
      const { files } = await parseTrajectoryFile(filePath);
      expect(files).toEqual([]);
    });
  });

  describe("fingerprints", () => {
    it("produces one fingerprint per valid trajectory line", async () => {
      await writeLines([
        messagePartLine("msg-1", 0, "hello"),
        messagePartLine("msg-1", 1, "world"),
        messageMetadataLine("msg-1"),
        filesLine(),
      ]);
      const { fingerprints } = await parseTrajectoryFile(filePath);
      expect(fingerprints).toHaveLength(4);
    });

    it("produces fingerprints with the correct prefixes", async () => {
      await writeLines([
        messagePartLine("msg-1", 0, "hello"),
        messageMetadataLine("msg-1"),
        filesLine(),
      ]);
      const { fingerprints } = await parseTrajectoryFile(filePath);
      expect(fingerprints[0]).toMatch(/^message-part:/);
      expect(fingerprints[1]).toMatch(/^message-metadata:/);
      expect(fingerprints[2]).toMatch(/^files:/);
    });

    it("produces identical fingerprints for identical content", async () => {
      const line = messagePartLine("msg-1", 0, "hello");
      await writeLines([line, line]);
      const { fingerprints } = await parseTrajectoryFile(filePath);
      expect(fingerprints[0]).toBe(fingerprints[1]);
    });

    it("produces different fingerprints for different content", async () => {
      await writeLines([
        messagePartLine("msg-1", 0, "hello"),
        messagePartLine("msg-1", 0, "world"),
      ]);
      const { fingerprints } = await parseTrajectoryFile(filePath);
      expect(fingerprints[0]).not.toBe(fingerprints[1]);
    });

    it("returns zero fingerprints for a file with no valid lines", async () => {
      await writeLines(["bad json", "also bad"]);
      const { fingerprints } = await parseTrajectoryFile(filePath);
      expect(fingerprints).toHaveLength(0);
    });
  });
});
