import { beforeEach, describe, expect, it, vi } from "vitest";

const generateTextMock = vi.hoisted(() => vi.fn());

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateText: generateTextMock,
  };
});
import type { Message } from "../../types";
import {
  compactTask,
  findInlineCompactAttachIndex,
  findVerbatimAttachIndex,
} from "../llm/compact-task";

function userMsg(id: string, text = "hi"): Message {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text }],
  } as unknown as Message;
}

function assistantMsg(id: string, text = "ok"): Message {
  return {
    id,
    role: "assistant",
    parts: [{ type: "text", text }],
  } as unknown as Message;
}

function compactUserMsg(id: string): Message {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text: "<compact>old summary</compact>" }],
  } as unknown as Message;
}

describe("findVerbatimAttachIndex", () => {
  it("returns undefined when no boundary id is provided", () => {
    const messages = [userMsg("u0"), assistantMsg("a0"), userMsg("u1")];
    expect(findVerbatimAttachIndex(messages, undefined)).toBeUndefined();
    expect(findVerbatimAttachIndex(messages, "")).toBeUndefined();
  });

  it("returns undefined when the boundary id is not present", () => {
    const messages = [userMsg("u0"), assistantMsg("a0"), userMsg("u1")];
    expect(findVerbatimAttachIndex(messages, "ghost")).toBeUndefined();
  });

  it("returns undefined when the boundary is the very first message", () => {
    const messages = [userMsg("u0"), assistantMsg("a0"), userMsg("u1")];
    // boundary at index 0 leaves no curated summary before it
    expect(findVerbatimAttachIndex(messages, "u0")).toBeUndefined();
  });

  it("returns undefined when the only reachable user message is index 0", () => {
    // Boundary lands on the first assistant message; walking back to
    // index 0 would keep everything verbatim and free no context.
    // Falling back to trailing-message attach is preferable.
    const messages = [
      userMsg("u0"),
      assistantMsg("a0"),
      assistantMsg("a1"),
      userMsg("u1"),
      assistantMsg("a2"),
    ];
    expect(findVerbatimAttachIndex(messages, "a0")).toBeUndefined();
  });

  it("returns undefined when the boundary equals or exceeds the trailing index", () => {
    const messages = [userMsg("u0"), assistantMsg("a0"), userMsg("u1")];
    // boundary at the last index leaves no room for verbatim retention
    expect(findVerbatimAttachIndex(messages, "u1")).toBeUndefined();
  });

  it("returns the boundary itself when it is already a user message", () => {
    const messages = [
      userMsg("u0"),
      assistantMsg("a0"),
      userMsg("u1"),
      assistantMsg("a1"),
      userMsg("u2"),
    ];
    expect(findVerbatimAttachIndex(messages, "u1")).toBe(2);
  });

  it("walks backwards to the nearest user message when boundary is on assistant", () => {
    const messages = [
      userMsg("u0"),
      assistantMsg("a0"),
      userMsg("u1"),
      assistantMsg("a1"),
      userMsg("u2"),
    ];
    // boundary points to the assistant turn; should walk back to u1
    expect(findVerbatimAttachIndex(messages, "a1")).toBe(2);
  });

  it("returns undefined when an existing compact block is at or after the boundary", () => {
    const messages = [
      userMsg("u0"),
      assistantMsg("a0"),
      compactUserMsg("u1-compact"),
      assistantMsg("a1"),
      userMsg("u2"),
    ];
    // existing compact at index 2; boundary u1-compact would shadow it
    expect(findVerbatimAttachIndex(messages, "u1-compact")).toBeUndefined();
    // boundary u0 (index 0) is before the previous compact — also rejected
    expect(findVerbatimAttachIndex(messages, "u0")).toBeUndefined();
  });

  it("attaches strictly after a previous compact block", () => {
    const messages = [
      userMsg("u0"),
      assistantMsg("a0"),
      compactUserMsg("u1-compact"),
      assistantMsg("a1"),
      userMsg("u2"),
      assistantMsg("a2"),
      userMsg("u3"),
    ];
    // previous compact at 2; boundary u2 is at index 4, a user message
    expect(findVerbatimAttachIndex(messages, "u2")).toBe(4);
  });

  it("returns undefined when no user message exists between previous compact and boundary", () => {
    const messages = [
      userMsg("u0"),
      assistantMsg("a0"),
      compactUserMsg("u1-compact"),
      assistantMsg("a1"),
      assistantMsg("a2"),
      userMsg("u3"),
    ];
    // previous compact at 2; boundary a2 (index 4) — no user msg between
    expect(findVerbatimAttachIndex(messages, "a2")).toBeUndefined();
  });
});

describe("findInlineCompactAttachIndex", () => {
  it("returns the latest user message when the tail is an assistant tool result", () => {
    const messages = [
      userMsg("u0"),
      assistantMsg("a0"),
      userMsg("u1"),
      assistantMsg("a1"),
    ];
    expect(findInlineCompactAttachIndex(messages)).toBe(2);
  });

  it("returns the trailing index when the tail is already a user message", () => {
    const messages = [userMsg("u0"), assistantMsg("a0"), userMsg("u1")];
    expect(findInlineCompactAttachIndex(messages)).toBe(2);
  });

  it("returns undefined when no user message exists", () => {
    const messages = [assistantMsg("a0"), assistantMsg("a1")];
    expect(findInlineCompactAttachIndex(messages)).toBeUndefined();
  });
});

describe("compactTask", () => {
  beforeEach(() => {
    generateTextMock.mockReset();
    generateTextMock.mockResolvedValue({ text: "fresh LLM summary" });
  });

  it("persists an inline compact block attached to a historical user message", async () => {
    const messages = [
      userMsg("u0"),
      assistantMsg("a0"),
      userMsg("u1"),
      assistantMsg("a1"),
      userMsg("u2"),
    ];
    const commits: Array<{
      name: string;
      args: { id?: string; text?: string };
    }> = [];
    const store = {
      query: () => ({ content: "memory summary" }),
      commit: (event: {
        name: string;
        args: { id?: string; text?: string };
      }) => {
        commits.push(event);
      },
    };

    await compactTask({
      blobStore: {} as never,
      taskId: "task-1",
      storeId: "store-1",
      model: {} as never,
      messages,
      taskMemoryBoundaryMessageId: "u1",
      inline: true,
      store: store as never,
    });

    expect(messages[2].parts[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("<compact>"),
    });
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({
      name: "v1.InlineCompactAttached",
      args: {
        id: messages[2].id,
        text: expect.stringContaining("<compact>"),
      },
    });
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("ignores old memory while the current extraction has no boundary", async () => {
    const messages = [
      userMsg("u0"),
      assistantMsg("a0"),
      compactUserMsg("u1-compact"),
      assistantMsg("a1"),
      userMsg("u2", "latest request"),
    ];
    const store = {
      query: vi.fn(() => ({ content: "stale memory through u0" })),
      commit: vi.fn(),
    };

    await compactTask({
      blobStore: {} as never,
      taskId: "task-1",
      storeId: "store-1",
      model: {} as never,
      messages,
      inline: true,
      store: store as never,
    });

    expect(store.query).not.toHaveBeenCalled();
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(messages.at(-1)?.parts[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("fresh LLM summary"),
    });
  });

  it("falls back non-inline when memory leaves a tail uncovered", async () => {
    const messages = [
      userMsg("u0", "initial request"),
      assistantMsg("a0"),
      userMsg("u1"),
      assistantMsg("a1", "latest assistant response"),
    ];
    const store = {
      query: vi.fn(() => ({ content: "stale memory" })),
      commit: vi.fn(),
    };

    const summary = await compactTask({
      blobStore: {} as never,
      taskId: "task-1",
      storeId: "store-1",
      model: {} as never,
      messages,
      taskMemoryBoundaryMessageId: "a0",
      store: store as never,
    });

    expect(store.query).not.toHaveBeenCalled();
    expect(JSON.stringify(generateTextMock.mock.calls[0]?.[0]?.prompt)).toContain(
      "latest assistant response",
    );
    expect(summary).toContain("Previous conversation summary (4 messages)");
  });

  it("uses non-inline memory when its boundary is the final message", async () => {
    const messages = [userMsg("u0"), assistantMsg("a0")];
    const store = {
      query: vi.fn(() => ({ content: "current memory" })),
      commit: vi.fn(),
    };

    const summary = await compactTask({
      blobStore: {} as never,
      taskId: "task-1",
      storeId: "store-1",
      model: {} as never,
      messages,
      taskMemoryBoundaryMessageId: "a0",
      store: store as never,
    });

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(summary).toContain("current memory");
  });
});
