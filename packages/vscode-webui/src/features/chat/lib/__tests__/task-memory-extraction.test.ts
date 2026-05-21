import type { TaskMemoryState } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import { describe, expect, it } from "vitest";
import {
  getExtractionMetrics,
  lastMessageHasOpenToolCall,
  shouldExtractTaskMemory,
  toExtractingState,
} from "../task-memory-extraction";

const baseState: TaskMemoryState = {
  initialized: false,
  lastExtractionTokens: 0,
  lastExtractionToolCalls: 0,
  isExtracting: false,
  extractionCount: 0,
};

function assistantMessage(
  id: string,
  parts: Message["parts"],
): Message {
  return {
    id,
    role: "assistant",
    parts,
  } as Message;
}

function usage(tokens: number) {
  return {
    system: tokens,
    tools: 0,
    messages: 0,
    files: 0,
    toolResults: 0,
  };
}

describe("task memory extraction metrics", () => {
  it("treats unresolved non-terminal tool calls as an unsafe fork boundary", () => {
    const messages = [
      assistantMessage("read-turn", [
        {
          type: "tool-readFile",
          toolCallId: "read-1",
          state: "input-available",
          input: { path: "src/file.ts" },
        },
      ]),
    ];

    const metrics = getExtractionMetrics({
      messages,
      contextWindowUsage: usage(20_000),
    });

    expect(lastMessageHasOpenToolCall(messages)).toBe(true);
    expect(metrics.trailingMessageHasOpenToolCall).toBe(true);
    expect(shouldExtractTaskMemory(baseState, metrics)).toBe(false);
  });

  it("allows terminal completion tools because they do not require tool output", () => {
    const messages = [
      assistantMessage("done-turn", [
        {
          type: "tool-attemptCompletion",
          toolCallId: "done-1",
          state: "input-available",
          input: { result: "Done" },
        },
      ]),
    ];

    const metrics = getExtractionMetrics({
      messages,
      contextWindowUsage: usage(20_000),
    });

    expect(lastMessageHasOpenToolCall(messages)).toBe(false);
    expect(shouldExtractTaskMemory(baseState, metrics)).toBe(true);
    expect(toExtractingState(baseState, metrics).pendingExtractionMessageId).toBe(
      "done-turn",
    );
  });
});
