import { describe, expect, it } from "vitest";
import type { Message } from "../../types";
import { findVerbatimAttachIndex } from "../llm/compact-task";

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
