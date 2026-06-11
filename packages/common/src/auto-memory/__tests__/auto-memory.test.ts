import type { AutoMemoryTaskState } from "@getpochi/common";
import type { AutoMemoryContext } from "@getpochi/common";
import type { UIMessage } from "ai";
import {
  didConversationWriteMemory,
  resolveAutoMemoryDreamState,
  resolveAutoMemoryExtractionState,
  serializeSessionTranscript,
  startAutoMemoryExtraction,
} from "../index";
import { describe, expect, it } from "vitest";

describe("auto-memory coordinator utilities", () => {
  it("starts extraction with a memory fork agent spec", async () => {
    const context = memoryContext();
    let state: AutoMemoryTaskState = {
      lastExtractionMessageCount: 0,
      isExtracting: false,
      extractionCount: 0,
      isDreaming: false,
    };
    let forkAgent: unknown;

    await startAutoMemoryExtraction({
      state,
      setAutoMemoryState: (nextState) => {
        state = nextState;
      },
      startForkAgent: (agent) => {
        forkAgent = agent;
        return {
          taskId: "memory-task",
          cwd: "/repo",
          label: "auto-memory",
        };
      },
      parentTaskId: "parent",
      parentCwd: "/repo",
      context,
      messages: [],
      previousMessageCount: 0,
      messageCount: 2,
    });

    expect(state).toMatchObject({
      isExtracting: true,
      activeExtractionTaskId: "memory-task",
      pendingExtractionMessageCount: 2,
    });
    expect(forkAgent).toMatchObject({
      label: "auto-memory",
      tools: [
        "readFile(/repo/.pochi/memory/**)",
        "readFile(/repo/.pochi/transcripts/**)",
        "listFiles(/repo/.pochi/memory/**)",
        "listFiles(/repo/.pochi/transcripts/**)",
        "globFiles(/repo/.pochi/memory/**)",
        "globFiles(/repo/.pochi/transcripts/**)",
        "searchFiles(/repo/.pochi/memory/**)",
        "searchFiles(/repo/.pochi/transcripts/**)",
        "writeToFile(/repo/.pochi/memory/**)",
        "applyDiff(/repo/.pochi/memory/**)",
        "attemptCompletion",
      ],
    });
  });

  it("detects successful writes inside the memory directory", () => {
    const messages = [
      {
        id: "m1",
        role: "assistant",
        parts: [
          {
            type: "tool-writeToFile",
            toolCallId: "write",
            state: "output-available",
            input: { path: "memory/index.md" },
            output: { success: true },
          },
        ],
      },
    ] as UIMessage[];

    expect(didConversationWriteMemory(messages, "/repo/memory", "/repo")).toBe(
      true,
    );
    expect(didConversationWriteMemory(messages, "/repo/other", "/repo")).toBe(
      false,
    );
  });

  it("resolves extraction state when the extraction task finishes", () => {
    const state: AutoMemoryTaskState = {
      lastExtractionMessageCount: 2,
      pendingExtractionMessageCount: 5,
      isExtracting: true,
      extractionCount: 1,
      activeExtractionTaskId: "extract",
      isDreaming: false,
    };

    expect(
      resolveAutoMemoryExtractionState({
        state,
        activeExtractionTask: { status: "pending-model" },
      }),
    ).toBeUndefined();

    expect(
      resolveAutoMemoryExtractionState({
        state,
        activeExtractionTask: { status: "completed" },
      }),
    ).toEqual({
      success: true,
      nextState: {
        lastExtractionMessageCount: 5,
        pendingExtractionMessageCount: undefined,
        isExtracting: false,
        extractionCount: 2,
        activeExtractionTaskId: undefined,
        isDreaming: false,
      },
    });
  });

  it("resolves dream state with finish metadata", () => {
    const state: AutoMemoryTaskState = {
      lastExtractionMessageCount: 5,
      isExtracting: false,
      extractionCount: 1,
      isDreaming: true,
      activeDreamTaskId: "dream",
      activeDreamToken: "token",
      activeDreamMemoryDir: "/repo/memory",
      activeDreamPreviousLastDreamAt: 123,
    };

    expect(
      resolveAutoMemoryDreamState({
        state,
        activeDreamTask: { status: "completed" },
      }),
    ).toEqual({
      finish: {
        memoryDir: "/repo/memory",
        token: "token",
        previousLastDreamAt: 123,
        success: true,
      },
      nextState: {
        lastExtractionMessageCount: 5,
        isExtracting: false,
        extractionCount: 1,
        isDreaming: false,
        activeDreamTaskId: undefined,
        activeDreamToken: undefined,
        activeDreamMemoryDir: undefined,
        activeDreamPreviousLastDreamAt: undefined,
      },
    });
  });

  it("serializes sanitized transcripts with a bounded length", () => {
    const transcript = serializeSessionTranscript([
      {
        id: "u1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "tool-readFile",
            toolCallId: "read",
            state: "output-available",
            input: { path: "a.ts" },
            output: { content: "source" },
          },
        ],
      },
    ] as UIMessage[]);

    expect(transcript).toContain("### 1. user");
    expect(transcript).toContain("### 2. assistant");
    expect(transcript).toContain("\"type\":\"tool-readFile\"");
    expect(transcript.length).toBeLessThan(24_000);
  });
});

function memoryContext(): AutoMemoryContext {
  return {
    enabled: true,
    repoKey: "repo",
    memoryDir: "/repo/.pochi/memory",
    indexPath: "/repo/.pochi/memory/index.md",
    indexContent: "",
    indexTruncated: false,
    manifest: [],
    transcriptDir: "/repo/.pochi/transcripts/",
  };
}
