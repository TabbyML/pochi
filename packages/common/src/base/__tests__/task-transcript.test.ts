import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { prompts } from "../prompts";
import {
  TaskTranscriptMaxRecordChars,
  TaskTranscriptMaxTextChars,
  serializeTaskTranscript,
} from "../task-transcript";

function parseRecords(transcript: string) {
  return transcript
    .split("\n")
    .filter((line) => line.startsWith("{"))
    .map((line) => JSON.parse(line));
}

describe("serializeTaskTranscript", () => {
  it("writes a header per message and one record per line", () => {
    const messages = [
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "Read a.ts" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "step-start" },
          { type: "reasoning", text: "thinking", providerMetadata: {} },
          { type: "text", text: "Reading it." },
          {
            type: "tool-readFile",
            toolCallId: "call-1",
            state: "output-available",
            input: { path: "a.ts" },
            output: { content: "export {}" },
          },
        ],
      },
    ] as UIMessage[];

    expect(serializeTaskTranscript(messages)).toBe(
      [
        "### 1. user",
        '{"type":"text","text":"Read a.ts"}',
        "",
        "### 2. assistant",
        '{"type":"text","text":"Reading it."}',
        '{"type":"tool-call","toolName":"readFile","toolCallId":"call-1","input":{"path":"a.ts"}}',
        '{"type":"tool-result","toolName":"readFile","toolCallId":"call-1","output":{"content":"export {}"}}',
      ].join("\n"),
    );
  });

  it("drops harness context but keeps other reminders", () => {
    const messages = [
      {
        id: "u1",
        role: "user",
        parts: [
          {
            type: "text",
            text: prompts.createSystemReminder(
              "# System Information\n\n# GIT STATUS\nclean",
            ),
          },
          {
            type: "text",
            text: prompts.createSystemReminder(prompts.toolCallsReminder),
          },
          {
            type: "text",
            text: prompts.createSystemReminder("Attached file: a.png"),
          },
          { type: "data-checkpoint", data: { commit: "abc" } },
          { type: "text", text: "Hello" },
        ],
      },
    ] as UIMessage[];

    const records = parseRecords(serializeTaskTranscript(messages));
    expect(records).toEqual([
      {
        type: "text",
        text: "<system-reminder>Attached file: a.png</system-reminder>",
      },
      { type: "text", text: "Hello" },
    ]);
  });

  it("splits long text across records without losing content", () => {
    const text = "line of user text\n".repeat(1_000);
    const messages = [
      { id: "u1", role: "user", parts: [{ type: "text", text }] },
    ] as UIMessage[];

    const records = parseRecords(serializeTaskTranscript(messages));
    expect(records.length).toBeGreaterThan(1);
    for (const record of records) {
      expect(record.text.length).toBeLessThanOrEqual(
        TaskTranscriptMaxTextChars,
      );
    }
    expect(records.map((record) => record.text).join("")).toBe(text);
  });

  it("keeps attemptCompletion results in full", () => {
    const result = "x".repeat(TaskTranscriptMaxTextChars * 2);
    const messages = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-attemptCompletion",
            toolCallId: "done",
            state: "input-available",
            input: { result },
          },
        ],
      },
    ] as UIMessage[];

    const records = parseRecords(serializeTaskTranscript(messages));
    expect(records[0]).toMatchObject({
      type: "tool-call",
      toolName: "attemptCompletion",
      field: "result",
    });
    expect(records.map((record) => record.text).join("")).toBe(result);
  });

  it("truncates large tool values and keeps every line bounded", () => {
    const content = `${"source line\n".repeat(3_000)}END OF TOOL RESULT`;
    const messages = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-readFile",
            toolCallId: "read",
            state: "output-available",
            input: { path: "a.ts" },
            output: { content, image: "data:image/png;base64,AAAA" },
          },
          {
            type: "tool-executeCommand",
            toolCallId: "cmd",
            state: "output-error",
            input: { command: "make" },
            errorText: "boom",
          },
        ],
      },
    ] as UIMessage[];

    const transcript = serializeTaskTranscript(messages);
    for (const line of transcript.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(TaskTranscriptMaxRecordChars);
    }
    const [, result, , error] = parseRecords(transcript);
    expect(result.output.content).toContain("chars truncated]");
    expect(result.output.content).toMatch(/END OF TOOL RESULT$/);
    expect(result.output.image).toBe("[data url omitted]");
    expect(error).toEqual({
      type: "tool-error",
      toolName: "executeCommand",
      toolCallId: "cmd",
      errorText: "boom",
    });
  });

  it("collapses records that stay too large after truncation", () => {
    const messages = [
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-searchFiles",
            toolCallId: "search",
            state: "output-available",
            input: {},
            output: { matches: Array.from({ length: 3_000 }, (_, i) => i) },
          },
        ],
      },
    ] as UIMessage[];

    const [, result] = parseRecords(serializeTaskTranscript(messages));
    expect(result).toEqual({
      type: "tool-result",
      toolName: "searchFiles",
      toolCallId: "search",
      omitted: "record too large",
    });
  });

  it("numbers headers by message index and skips empty messages", () => {
    const messages = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "a" }] },
      { id: "a1", role: "assistant", parts: [{ type: "step-start" }] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "b" }] },
    ] as UIMessage[];

    const transcript = serializeTaskTranscript(messages);
    expect(transcript).toContain("### 1. user");
    expect(transcript).not.toContain("### 2.");
    expect(transcript).toContain("### 3. user");
  });
});
