import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseTrajectoryFile } from "../cli";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

describe("parseTrajectoryFile", () => {
  const testDir = path.join(os.tmpdir(), "pochi-trajectory-test");
  const testFile = path.join(testDir, "trajectory.jsonl");

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should return empty array if file does not exist", () => {
    const messages = parseTrajectoryFile(path.join(testDir, "nonexistent.jsonl"));
    expect(messages).toEqual([]);
  });

  it("should parse message parts and metadata in correct order", async () => {
    const lines = [
      JSON.stringify({
        type: "message-part",
        timestamp: new Date().toISOString(),
        messageId: "msg-1",
        role: "user",
        index: 0,
        part: { type: "text", text: "hello" },
      }),
      JSON.stringify({
        type: "message-metadata",
        messageId: "msg-1",
        role: "user",
        metadata: { kind: "user" },
      }),
      JSON.stringify({
        type: "message-part",
        timestamp: new Date().toISOString(),
        messageId: "msg-2",
        role: "assistant",
        index: 0,
        part: { type: "text", text: "hi there" },
      }),
      JSON.stringify({
        type: "message-part",
        timestamp: new Date().toISOString(),
        messageId: "msg-2",
        role: "assistant",
        index: 1,
        part: { type: "text", text: " how can I help?" },
      }),
      JSON.stringify({
        type: "step-metadata",
        taskId: "task-1",
        messageId: "msg-2",
        stepIndex: 0,
        hasError: false,
      }),
      JSON.stringify({
        type: "files",
        files: [],
      }),
    ];

    await fs.writeFile(testFile, lines.join("\n"), "utf8");

    const messages = parseTrajectoryFile(testFile);
    expect(messages).toHaveLength(2);

    expect(messages[0]).toEqual({
      id: "msg-1",
      role: "user",
      parts: [{ type: "text", text: "hello" }],
      metadata: { kind: "user" },
    });

    expect(messages[1]).toEqual({
      id: "msg-2",
      role: "assistant",
      parts: [
        { type: "text", text: "hi there" },
        { type: "text", text: " how can I help?" },
      ],
    });
  });

  it("should handle out-of-order parts and sparse indices", async () => {
    const lines = [
      JSON.stringify({
        type: "message-part",
        timestamp: new Date().toISOString(),
        messageId: "msg-1",
        role: "user",
        index: 1,
        part: { type: "text", text: "second part" },
      }),
      JSON.stringify({
        type: "message-part",
        timestamp: new Date().toISOString(),
        messageId: "msg-1",
        role: "user",
        index: 0,
        part: { type: "text", text: "first part" },
      }),
    ];

    await fs.writeFile(testFile, lines.join("\n"), "utf8");

    const messages = parseTrajectoryFile(testFile);
    expect(messages).toHaveLength(1);
    expect(messages[0].parts).toEqual([
      { type: "text", text: "first part" },
      { type: "text", text: "second part" },
    ]);
  });
});
