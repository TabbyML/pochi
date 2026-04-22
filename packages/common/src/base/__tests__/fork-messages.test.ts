import { describe, expect, it } from "vitest";
import { buildForkDirective, buildForkMessages } from "../agents/fork-messages";

describe("buildForkDirective", () => {
  it("wraps the task in a fork directive block", () => {
    const directive = buildForkDirective("Summarize the current diff.");

    expect(directive).toContain("<fork-directive>");
    expect(directive).toContain("Summarize the current diff.");
    expect(directive).toContain("Do NOT spawn sub-agents");
  });
});

describe("buildForkMessages", () => {
  it("clones parent messages and regenerates message ids", () => {
    const parentMessages = [
      {
        id: "message-1",
        role: "user" as const,
        parts: [{ type: "text", text: "First" }],
      },
      {
        id: "message-2",
        role: "assistant" as const,
        parts: [{ type: "text", text: "Second" }],
      },
    ];

    const messages = buildForkMessages(parentMessages, "Do the next step.");

    expect(messages).toHaveLength(3);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.parts).toEqual(parentMessages[0]?.parts);
    expect(messages[0]?.id).not.toBe(parentMessages[0]?.id);
    expect(messages[1]?.role).toBe("assistant");
    expect(messages[1]?.parts).toEqual(parentMessages[1]?.parts);
    expect(messages[1]?.id).not.toBe(parentMessages[1]?.id);
    expect(messages[2]?.role).toBe("user");
    expect(messages[2]?.parts).toEqual([
      {
        type: "text",
        text: buildForkDirective("Do the next step."),
      },
    ]);
  });
});
