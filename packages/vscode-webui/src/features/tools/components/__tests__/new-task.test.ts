import { describe, expect, it } from "vitest";
import {
  getAttemptTodoCompletionState,
  getAttemptTodoCompletionSummary,
  hasNewTaskResult,
} from "../new-task/result";

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
        success: false,
        summary: "More work remains.",
        todoUpdates: [{ status: "in-progress" }],
      }),
    ).toBe("More work remains.");
  });

  it("returns summary from JSON string results", () => {
    expect(
      getAttemptTodoCompletionSummary(
        JSON.stringify({
          success: false,
          summary: "More work remains.",
          todoUpdates: [{ status: "in-progress" }],
        }),
      ),
    ).toBe("More work remains.");
  });

  it("ignores incomplete structured results", () => {
    expect(
      getAttemptTodoCompletionSummary({
        success: false,
        summary: "More work remains.",
      }),
    ).toBeUndefined();
  });

  it("ignores non-summary results", () => {
    expect(getAttemptTodoCompletionSummary("Done")).toBeUndefined();
  });
});

describe("getAttemptTodoCompletionState", () => {
  it("detects satisfied todo completion results", () => {
    expect(
      getAttemptTodoCompletionState(
        JSON.stringify({
          success: true,
          summary: "Todo is satisfied.",
          todoUpdates: [{ status: "completed" }],
        }),
      ),
    ).toEqual({
      status: "satisfied",
      summary: "Todo is satisfied.",
    });
  });

  it("detects todo completion results that need more work", () => {
    expect(
      getAttemptTodoCompletionState({
        success: false,
        summary: "More work remains.",
        todoUpdates: [{ status: "in-progress" }],
      }),
    ).toEqual({
      status: "needs-work",
      summary: "More work remains.",
    });
  });

  it("ignores malformed todo completion results", () => {
    expect(getAttemptTodoCompletionState("Done")).toBeUndefined();
  });
});
