import { describe, expect, it } from "vitest";
import {
  getAttemptTodoCompletionSummary,
  hasNewTaskResult,
  isAttemptTodoCompletionResolved,
} from "../new-task/result";

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

describe("hasNewTaskResult", () => {
  it("accepts structured subtask results", () => {
    expect(
      hasNewTaskResult({
        success: true,
        summary: "Audit passed.",
      }),
    ).toBe(true);
  });

  it("ignores blank string results", () => {
    expect(hasNewTaskResult("   ")).toBe(false);
  });
});

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
  it("detects resolved completed todo completion results", () => {
    expect(
      isAttemptTodoCompletionResolved({
        summary: "All todos are complete.",
        todos: completedTodos,
      }),
    ).toBe(true);
  });

  it("detects completed todo completion results", () => {
    expect(
      isAttemptTodoCompletionResolved(
        JSON.stringify({
          summary: "All todos are complete.",
          todos: completedTodos,
        }),
      ),
    ).toBe(true);
  });

  it("detects unresolved todo completion results", () => {
    expect(
      isAttemptTodoCompletionResolved({
        summary: "More work remains.",
        todos: inProgressTodos,
      }),
    ).toBe(false);
  });

  it("ignores malformed todo completion results", () => {
    expect(isAttemptTodoCompletionResolved("Done")).toBeUndefined();
  });
});
