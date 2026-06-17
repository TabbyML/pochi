import { describe, expect, it } from "vitest";
import {
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
