import { TaskMemoryFileUri, type TaskMemoryState } from "../../base";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  getExtractionMetrics,
  resolveTaskMemoryExtractionState,
  shouldExtractTaskMemory,
  startTaskMemoryExtraction,
} from "../index";

const baseState: TaskMemoryState = {
  initialized: false,
  lastExtractionTokens: 0,
  lastExtractionToolCalls: 0,
  isExtracting: false,
  extractionCount: 0,
};

function assistantMessage(
  id: string,
  parts: UIMessage["parts"],
): UIMessage {
  return {
    id,
    role: "assistant",
    parts,
  } as UIMessage;
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

function task(status: string): { status: string } {
  return { status };
}

function writeMemoryMessage(
  state: "input-available" | "output-available" | "output-error",
): UIMessage {
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
    } as UIMessage["parts"][number],
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

    expect(metrics.trailingMessageHasOpenToolCall).toBe(true);
    expect(shouldExtractTaskMemory(baseState, metrics)).toBe(true);
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

    expect(metrics.trailingMessageHasOpenToolCall).toBe(false);
    expect(shouldExtractTaskMemory(baseState, metrics)).toBe(true);
  });
});

describe("task memory extraction completion", () => {
  it("starts extraction with a task-memory fork agent spec", async () => {
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
    let taskMemoryState = baseState;
    let forkAgent: unknown;

    await startTaskMemoryExtraction({
      state: taskMemoryState,
      metrics,
      setTaskMemoryState: (state) => {
        taskMemoryState = state;
      },
      startForkAgent: (agent) => {
        forkAgent = agent;
        return {
          taskId: "memory-task",
          cwd: "/repo",
          label: "task-memory",
        };
      },
      parentTaskId: "parent",
      parentMessages: messages,
      parentCwd: "/repo",
    });

    expect(taskMemoryState).toMatchObject({
      initialized: true,
      isExtracting: true,
      activeTaskId: "memory-task",
      pendingExtractionMessageId: "read-turn",
    });
    expect(forkAgent).toMatchObject({
      label: "task-memory",
      tools: [
        "readFile",
        `writeToFile(${TaskMemoryFileUri})`,
        "attemptCompletion",
      ],
    });
  });

  it("succeeds once the extraction wrote memory.md", () => {
    expect(
      resolveTaskMemoryExtractionState({
        state: extractingState(),
        activeTask: task("pending-tool"),
        activeMessages: [writeMemoryMessage("output-available")],
      }),
    ).toMatchObject({
      isExtracting: false,
      extractionCount: 1,
      activeTaskId: undefined,
    });
  });

  it("fails when the extraction stops without writing memory.md", () => {
    expect(
      resolveTaskMemoryExtractionState({
        state: extractingState(),
        activeTask: task("failed"),
        activeMessages: [writeMemoryMessage("input-available")],
      }),
    ).toMatchObject({
      isExtracting: false,
      extractionCount: 0,
      activeTaskId: undefined,
    });
  });

  it("keeps waiting while the extraction is still running without a memory write", () => {
    expect(
      resolveTaskMemoryExtractionState({
        state: extractingState(),
        activeTask: task("pending-tool"),
        activeMessages: [writeMemoryMessage("input-available")],
      }),
    ).toBeUndefined();
  });
});

function extractingState(): TaskMemoryState {
  return {
    ...baseState,
    initialized: true,
    isExtracting: true,
    activeTaskId: "memory-task",
    pendingExtractionMessageId: "boundary",
  };
}
