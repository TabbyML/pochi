import { describe, expect, it } from "vitest";
import {
  getAttemptTodoCompletionSummary,
  isAttemptTodoCompletionResolved,
} from "../todos-utils";

function makeResolvedTodos(status: "completed" | "in-progress") {
  return [
    {
      id: "todo-1",
      content: "Add one test",
      status,
      priority: "medium",
    },
  ] as const;
}

const completedTodos = makeResolvedTodos("completed");
const inProgressTodos = makeResolvedTodos("in-progress");

describe("getAttemptTodoCompletionSummary", () => {
  it("returns summary from structured results", () => {
    expect(
      getAttemptTodoCompletionSummary({
        summary: "More work remains.",
        todos: inProgressTodos,
      }),
    ).toBe("More work remains.");
  });

  it("returns summary from JSON string results", () => {
    expect(
      getAttemptTodoCompletionSummary(
        JSON.stringify({
          summary: "More work remains.",
          todos: inProgressTodos,
        }),
      ),
    ).toBe("More work remains.");
  });

  it("ignores incomplete structured results", () => {
    expect(
      getAttemptTodoCompletionSummary({
        summary: "More work remains.",
      }),
    ).toBeUndefined();
  });

  it("ignores non-summary results", () => {
    expect(getAttemptTodoCompletionSummary("Done")).toBeUndefined();
  });
});

describe("isAttemptTodoCompletionResolved", () => {
  it("detects resolved todo completion output envelopes", () => {
    expect(
      isAttemptTodoCompletionResolved({
        result: {
          summary: "All todos are complete.",
          todos: completedTodos,
        },
      }),
    ).toBe(true);
  });

  it("detects unresolved JSON output envelopes", () => {
    expect(
      isAttemptTodoCompletionResolved({
        type: "json",
        value: {
          result: JSON.stringify({
            summary: "More work remains.",
            todos: inProgressTodos,
          }),
        },
      }),
    ).toBe(false);
  });

  it("falls back to legacy success results", () => {
    expect(isAttemptTodoCompletionResolved({ success: false })).toBe(false);
  });
});
