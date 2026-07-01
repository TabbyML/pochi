import { describe, expect, it } from "vitest";
import type { Message } from "@getpochi/livekit";
import { getTodoContinuationDecision } from "../todo-continuation";

function makeAttemptTodoCompletionMessage(output: unknown): Message {
  return {
    id: "assistant-1",
    role: "assistant",
    parts: [
      {
        type: "tool-newTask",
        toolCallId: "tool-1",
        state: "output-available",
        input: {
          agentType: "attemptTodoCompletion",
        },
        output,
      },
    ],
  } as Message;
}

describe("getTodoContinuationDecision", () => {
  it("stops when attemptTodoCompletion succeeds", () => {
    expect(
      getTodoContinuationDecision([
        makeAttemptTodoCompletionMessage({
          result: {
            success: true,
            summary: "Done.",
          },
        }),
      ]),
    ).toBe(false);
  });

  it("continues when attemptTodoCompletion rejects completion", () => {
    const messages = [
      makeAttemptTodoCompletionMessage({
        result: {
          success: false,
          summary: "More work remains.",
        },
      }),
    ];

    expect(getTodoContinuationDecision(messages)).toBe(true);
  });

  it("continues when attemptTodoCompletion returns a JSON string result", () => {
    expect(
      getTodoContinuationDecision([
        makeAttemptTodoCompletionMessage({
          result: JSON.stringify({
            success: false,
            summary: "More work remains.",
            todoUpdates: [{ id: "todo-1", status: "in-progress" }],
          }),
        }),
      ]),
    ).toBe(true);
  });

  it("handles JSON output envelopes from tool results", () => {
    expect(
      getTodoContinuationDecision([
        makeAttemptTodoCompletionMessage({
          type: "json",
          value: {
            result: {
              success: true,
              summary: "Done.",
            },
          },
        }),
      ]),
    ).toBe(false);
  });

  it("does not fall back to normal tool continuation for malformed audit output", () => {
    expect(
      getTodoContinuationDecision([
        makeAttemptTodoCompletionMessage({
          result: {
            summary: "Missing success.",
          },
        }),
      ]),
    ).toBe(false);
  });

  it("does not handle unrelated assistant messages", () => {
    expect(
      getTodoContinuationDecision([
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "Done." }],
        } as Message,
      ]),
    ).toBeUndefined();
  });
});
