import { TaskMemoryFileUri, type TaskMemoryState } from "@getpochi/common";
import type { Message, Task } from "@getpochi/livekit";
import { describe, expect, it } from "vitest";
import {
  getExtractionMetrics,
  getTaskMemoryExtractionResult,
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
    projectMemory: 0,
  };
}

function task(status: Task["status"]): Pick<Task, "status"> {
  return { status };
}

function writeMemoryMessage(
  state: "input-available" | "output-available" | "output-error",
): Message {
  const output =
    state === "output-available"
      ? { output: "Wrote memory" }
      : state === "output-error"
        ? { error: "Write failed" }
        : undefined;
  return assistantMessage("write-memory", [
    {
      type: "tool-writeToFile",
      toolCallId: "write-1",
      state,
      input: { path: TaskMemoryFileUri, content: "# Session Title" },
      ...(output === undefined ? {} : { output }),
    } as Message["parts"][number],
  ]);
}

describe("task memory extraction metrics", () => {
  it("allows unresolved non-terminal tool calls as the extraction boundary", () => {
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
    expect(shouldExtractTaskMemory(baseState, metrics)).toBe(true);
    expect(toExtractingState(baseState, metrics).pendingExtractionMessageId).toBe(
      "read-turn",
    );
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

describe("task memory extraction completion", () => {
  it("succeeds once the extraction wrote memory.md", () => {
    expect(
      getTaskMemoryExtractionResult(
        task("pending-tool"),
        [writeMemoryMessage("output-available")],
      ),
    ).toBe("succeeded");
  });

  it("fails when the extraction stops without writing memory.md", () => {
    expect(
      getTaskMemoryExtractionResult(
        task("failed"),
        [writeMemoryMessage("input-available")],
      ),
    ).toBe("failed");
    expect(
      getTaskMemoryExtractionResult(
        task("pending-input"),
        [writeMemoryMessage("output-error")],
      ),
    ).toBe("failed");
  });

  it("keeps waiting while the extraction is still running without a memory write", () => {
    expect(
      getTaskMemoryExtractionResult(
        task("pending-tool"),
        [writeMemoryMessage("input-available")],
      ),
    ).toBe("pending");
  });
});
