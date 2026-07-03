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

const completedTodos = [
  {
    id: "todo-1",
    content: "Add one test",
    status: "completed",
    priority: "medium",
  },
] as const;

const activeTodos = [
  {
    id: "todo-1",
    content: "Add one test",
    status: "in-progress",
    priority: "medium",
  },
] as const;

describe("getTodoContinuationDecision", () => {
  it("stops when attemptTodoCompletion resolves every todo", () => {
    expect(
      getTodoContinuationDecision([
        makeAttemptTodoCompletionMessage({
          result: {
            summary: "Done.",
            todos: completedTodos,
          },
        }),
      ]),
    ).toBe(false);
  });

  it("continues when attemptTodoCompletion leaves active todos", () => {
    const messages = [
      makeAttemptTodoCompletionMessage({
        result: {
          summary: "More work remains.",
          todos: activeTodos,
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
            summary: "More work remains.",
            todos: activeTodos,
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
              summary: "Done.",
              todos: completedTodos,
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
