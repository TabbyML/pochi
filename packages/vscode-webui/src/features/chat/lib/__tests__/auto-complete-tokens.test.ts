import type { Message } from "@getpochi/livekit";
import { describe, expect, it } from "vitest";
import { collectAutoCompleteTokens } from "../auto-complete-tokens";

function makeTextMessage(id: string, text: string): Message {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
  } as unknown as Message;
}

describe("collectAutoCompleteTokens", () => {
  it("returns an empty string for no messages", () => {
    expect(collectAutoCompleteTokens([])).toBe("");
  });

  it("collects word tokens from message text", () => {
    const tokens = collectAutoCompleteTokens([
      makeTextMessage("1", "update collectAutoCompleteTokens in chat_toolbar"),
    ]).split(" ");

    expect(tokens).toContain("update");
    expect(tokens).toContain("collectAutoCompleteTokens");
    expect(tokens).toContain("chat_toolbar");
  });

  it("skips tokens shorter than three characters", () => {
    const tokens = collectAutoCompleteTokens([
      makeTextMessage("1", "a bc def"),
    ]).split(" ");

    expect(tokens).not.toContain("a");
    expect(tokens).not.toContain("bc");
    expect(tokens).toContain("def");
  });

  it("dedupes repeated tokens", () => {
    const tokens = collectAutoCompleteTokens([
      makeTextMessage("1", "foo foo foo"),
    ]).split(" ");

    expect(tokens.filter((token) => token === "foo")).toHaveLength(1);
  });

  it("walks nested tool inputs and outputs", () => {
    const message = {
      id: "1",
      role: "assistant",
      parts: [
        {
          type: "tool-readFile",
          toolCallId: "call-1",
          state: "output-available",
          input: { path: "packages/nested_path.ts" },
          output: { content: "exportedSymbol" },
        },
      ],
    } as unknown as Message;

    const tokens = collectAutoCompleteTokens([message]).split(" ");
    expect(tokens).toContain("nested_path");
    expect(tokens).toContain("exportedSymbol");
  });

  it("caps the number of collected tokens", () => {
    const words = Array.from({ length: 5000 }, (_, i) => `token${i}`).join(" ");
    const tokens = collectAutoCompleteTokens([
      makeTextMessage("1", words),
    ]).split(" ");

    expect(tokens.length).toBe(2500);
  });

  it("prefers the newest messages when the budget is exhausted", () => {
    const olderWords = Array.from(
      { length: 5000 },
      (_, i) => `older${i}`,
    ).join(" ");

    const tokens = collectAutoCompleteTokens([
      makeTextMessage("1", olderWords),
      makeTextMessage("2", "newestToken"),
    ]).split(" ");

    expect(tokens).toContain("newestToken");
  });

  it("does not scan unbounded amounts of text", () => {
    // A single huge tool output must not force a full scan of the transcript.
    const huge = "x".repeat(1024 * 1024);
    const tokens = collectAutoCompleteTokens([
      makeTextMessage("1", "shouldNotBeReached"),
      makeTextMessage("2", huge),
    ]).split(" ");

    expect(tokens).not.toContain("shouldNotBeReached");
  });
});
