import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaxPersistedToolResultSize, PersistedToolResultPreviewSize } from "../limits";
import { maybePersistToolResult } from "../tool-result-persistence";

let tmpDir: string;

vi.mock("node:os", async (importOriginal) => {
  const actual = await importOriginal<typeof os>();
  return { ...actual, homedir: () => tmpDir };
});

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pochi-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const TOOL_CALL_ID = "call-abc";
const TASK_ID = "task-xyz";

function makeOutput(fieldValue: string) {
  return { output: fieldValue, isTruncated: false };
}

function largeString(size = MaxPersistedToolResultSize + 1) {
  return "x".repeat(size);
}

describe("maybePersistToolResult", () => {
  it("returns output unchanged when under threshold", async () => {
    const output = makeOutput("small output");
    const result = await maybePersistToolResult("executeCommand", TOOL_CALL_ID, TASK_ID, output);
    expect(result).toBe(output);
  });

  it("returns output unchanged for exempt tool (readFile)", async () => {
    const output = makeOutput(largeString());
    const result = await maybePersistToolResult("readFile", TOOL_CALL_ID, TASK_ID, output);
    expect(result).toBe(output);
  });

  it("returns output unchanged for non-object output", async () => {
    const result = await maybePersistToolResult("executeCommand", TOOL_CALL_ID, TASK_ID, "plain string");
    expect(result).toBe("plain string");
  });

  describe("Case 1: top-level string fields", () => {
    it("truncates large string field and writes full output to disk", async () => {
      const big = largeString();
      const output = makeOutput(big);
      const result = await maybePersistToolResult("executeCommand", TOOL_CALL_ID, TASK_ID, output) as typeof output;

      // Field replaced with truncated message
      expect(typeof result.output).toBe("string");
      expect(result.output).toContain("[Output too large:");
      expect(result.output).toContain(".json");
      expect(result.output).toContain("Preview");

      // Other fields preserved
      expect(result.isTruncated).toBe(false);

      // File written with full JSON-stringified output
      const filePath = path.join(tmpDir, ".pochi", "tasks", TASK_ID, "tool-results", `${TOOL_CALL_ID}.json`);
      const fileContent = await fs.readFile(filePath, "utf-8");
      expect(fileContent).toBe(JSON.stringify(output));
    });

    it("preview contains first chars of the large field", async () => {
      const big = "ABCD".repeat(MaxPersistedToolResultSize);
      const output = makeOutput(big);
      const result = await maybePersistToolResult("executeCommand", TOOL_CALL_ID, TASK_ID, output) as typeof output;

      expect(result.output).toContain("ABCD");
      expect(result.output.length).toBeLessThan(PersistedToolResultPreviewSize * 3);
    });

    it("skips small string fields", async () => {
      const output: Record<string, unknown> = {};
      const fieldCount = Math.ceil((MaxPersistedToolResultSize + 1) / 100);
      for (let i = 0; i < fieldCount; i++) {
        output[`field${i}`] = "x".repeat(100);
      }
      const result = await maybePersistToolResult("executeCommand", TOOL_CALL_ID, TASK_ID, output);
      expect(result).toBe(output);
    });
  });

  describe("Case 2: MCP content array", () => {
    it("replaces all-text content array with single preview block", async () => {
      const big = largeString();
      const output = {
        content: [
          { type: "text", text: big },
          { type: "text", text: "more text" },
        ],
      };
      const result = await maybePersistToolResult("someMcpTool", TOOL_CALL_ID, TASK_ID, output) as typeof output;

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("[Output too large:");

      // File contains full original output
      const filePath = path.join(tmpDir, ".pochi", "tasks", TASK_ID, "tool-results", `${TOOL_CALL_ID}.json`);
      const fileContent = await fs.readFile(filePath, "utf-8");
      expect(fileContent).toBe(JSON.stringify(output));
    });

    it("skips content array containing non-text blocks", async () => {
      const output = {
        content: [
          { type: "text", text: largeString() },
          { type: "image", data: "base64data", mimeType: "image/png" },
        ],
      };
      const result = await maybePersistToolResult("someMcpTool", TOOL_CALL_ID, TASK_ID, output);
      expect(result).toBe(output);
    });
  });
});

