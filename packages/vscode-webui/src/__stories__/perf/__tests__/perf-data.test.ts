import { describe, expect, it } from "vitest";
import {
  appendTaskHistoryTurn,
  makeAddedFilePatch,
  makeFileMatches,
  makeReplaceFilePatch,
  makeTaskHistoryMessages,
  makeWriteToFileTool,
  summarizeMessageRange,
  summarizeTaskHistory,
  updateTaskHistoryStream,
} from "../perf-data";

describe("perf data", () => {
  it("creates a valid added-file patch with the requested number of additions", () => {
    const patch = makeAddedFilePatch("plan.md", 3);

    expect(patch).toContain("diff --git a/plan.md b/plan.md");
    expect(patch).toContain("new file mode 100644");
    expect(patch).toContain("@@ -0,0 +1,3 @@");
    expect(patch.match(/^\+/gm)).toHaveLength(4);
  });

  it("creates a replace patch with balanced additions and removals", () => {
    const patch = makeReplaceFilePatch("plan.md", 4);

    expect(patch).toContain("index 1111111..2222222 100644");
    expect(patch).toContain("@@ -1,4 +1,4 @@");
    expect(patch.match(/^\-/gm)).toHaveLength(5);
    expect(patch.match(/^\+/gm)).toHaveLength(5);
  });

  it("creates deterministic file matches", () => {
    expect(makeFileMatches(2)).toEqual([
      {
        file: "packages/example/src/generated/file-00000.tsx",
        line: 1,
        context: "match context for generated file 1",
      },
      {
        file: "packages/example/src/generated/file-00001.tsx",
        line: 2,
        context: "match context for generated file 2",
      },
    ]);
  });

  it("creates markdown-heavy writeToFile data", () => {
    const tool = makeWriteToFileTool(20);
    const input = tool.input as { content: string };
    const output = tool.output as { _meta: { edit: string } };

    expect(input.content).toContain("# Current implementation plan");
    expect(input.content).toContain("```ts");
    expect(input.content).toContain("| Area | Signal | Expected impact |");
    expect(input.content.split("\n")).toHaveLength(20);
    expect(output._meta.edit).toContain("```json");
  });

  it("creates task history with varied assistant parts", () => {
    const messages = makeTaskHistoryMessages({
      messageCount: 4,
      assistantPartsPerMessage: 30,
      partTextLength: 40,
    });

    expect(messages.map((message) => [message.role, message.parts.length]))
      .toEqual([
        ["user", 1],
        ["assistant", 30],
        ["user", 1],
        ["assistant", 30],
      ]);
    const assistantParts = messages[1].parts;
    expect(assistantParts.filter((part) => part.type === "reasoning"))
      .toHaveLength(6);
    expect(
      new Set(
        assistantParts
          .filter((part) => part.type.startsWith("tool-"))
          .map((part) => part.type),
      ),
    ).toEqual(
      new Set([
        "tool-readFile",
        "tool-executeCommand",
        "tool-searchFiles",
        "tool-listFiles",
        "tool-globFiles",
        "tool-writeToFile",
      ]),
    );
    expect(assistantParts.at(-1)?.type).toBe("text");
  });

  it("appends one deterministic user and assistant turn", () => {
    const original = makeTaskHistoryMessages({
      messageCount: 2,
      assistantPartsPerMessage: 30,
      partTextLength: 32,
    });

    const next = appendTaskHistoryTurn(original, {
      assistantPartsPerMessage: 30,
      partTextLength: 32,
      turnIndex: 7,
    });

    expect(next.slice(0, 2)).toEqual(original);
    expect(next.slice(2).map(({ id, role }) => ({ id, role }))).toEqual([
      { id: "task-history-turn-7-user", role: "user" },
      { id: "task-history-turn-7-assistant", role: "assistant" },
    ]);
  });

  it("replaces only the streaming assistant message through one snapshot", () => {
    const original = makeTaskHistoryMessages({
      messageCount: 2,
      assistantPartsPerMessage: 30,
      partTextLength: 32,
    });
    const originalLastTextPart = original[1].parts.findLast(
      (part) => part.type === "text",
    );
    if (!originalLastTextPart) {
      throw new Error("Expected assistant text parts");
    }
    let snapshots = 0;

    const next = updateTaskHistoryStream(original, {
      updateIndex: 3,
      chunkSize: 12,
      snapshot: (message) => {
        snapshots += 1;
        return structuredClone(message);
      },
    });

    const nextLastTextPart = next[1].parts.findLast(
      (part) => part.type === "text",
    );
    if (!nextLastTextPart) {
      throw new Error("Expected updated assistant text parts");
    }
    expect(snapshots).toBe(1);
    expect(next[0]).toBe(original[0]);
    expect(nextLastTextPart.state).toBe("streaming");
    expect(nextLastTextPart.text).toHaveLength(
      originalLastTextPart.text.length + 12,
    );
  });

  it("summarizes full and mounted message data", () => {
    const messages = makeTaskHistoryMessages({
      messageCount: 4,
      assistantPartsPerMessage: 30,
      partTextLength: 40,
    });

    const summary = summarizeTaskHistory(messages);

    expect(summary.messageCount).toBe(4);
    expect(summary.partCount).toBe(62);
    expect(summary.serializedBytes).toBeGreaterThan(0);
    expect(summarizeMessageRange(messages, 2)).toEqual({
      inputMessageCount: 4,
      inputPartCount: 62,
      mountedMessageCount: 2,
      mountedPartCount: 31,
    });
  });
});
