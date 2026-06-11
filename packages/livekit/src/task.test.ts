import { describe, expect, it } from "vitest";
import { toTaskStatus } from "./task";
import type { Message } from "./types";

describe("toTaskStatus", () => {
  it("marks completeTodo success as completed", () => {
    const message: Message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-completeTodo",
          toolCallId: "tool-1",
          state: "output-available",
          input: {},
          output: {
            success: true,
            summary: "Done.",
          },
        },
      ],
    } as any;

    expect(toTaskStatus(message, "tool-calls")).toBe("completed");
  });

  it("keeps completeTodo success false non-terminal", () => {
    const message: Message = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        {
          type: "tool-completeTodo",
          toolCallId: "tool-1",
          state: "output-available",
          input: {},
          output: {
            success: false,
            summary: "More work remains.",
          },
        },
      ],
    } as any;

    expect(toTaskStatus(message, "tool-calls")).toBe("pending-input");
  });
});
