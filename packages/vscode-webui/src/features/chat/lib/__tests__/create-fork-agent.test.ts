import type { Message } from "@getpochi/livekit";
import { describe, expect, it } from "vitest";
import { buildForkMessages } from "../create-fork-agent";

describe("buildForkMessages", () => {
  it("clones parent messages with fresh ids", () => {
    const parentMessages = [
      {
        id: "parent-message-1",
        role: "user",
        parts: [
          { type: "text", text: "hello" },
          { type: "data-checkpoint", data: { commit: "abc123" } },
        ],
      },
      {
        id: "parent-message-2",
        role: "assistant",
        parts: [{ type: "text", text: "done" }],
      },
    ] as Message[];

    const result = buildForkMessages(parentMessages, "extract memory");

    expect(result).toHaveLength(3);
    expect(result[0].id).not.toBe(parentMessages[0].id);
    expect(result[1].id).not.toBe(parentMessages[1].id);
    expect(result[0].parts).toEqual(parentMessages[0].parts);
    expect(result[1].parts).toEqual(parentMessages[1].parts);
    expect(result[2]).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "extract memory" }],
    });
  });
});
