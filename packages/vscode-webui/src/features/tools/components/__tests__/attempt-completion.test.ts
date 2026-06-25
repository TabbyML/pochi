import { describe, expect, it } from "vitest";
import {
  getAttemptCompletionResultDisplay,
  isAttemptTodoCompletionRejected,
} from "../tool-result-display";

describe("getAttemptCompletionResultDisplay", () => {
  it("formats JSON object string results as json", () => {
    expect(
      getAttemptCompletionResultDisplay(
        JSON.stringify({ success: true, summary: "Done." }),
      ),
    ).toEqual({
      type: "json",
      content: '{\n  "success": true,\n  "summary": "Done."\n}',
    });
  });

  it("keeps normal string results as markdown", () => {
    expect(getAttemptCompletionResultDisplay("Done.")).toEqual({
      type: "markdown",
      content: "Done.",
    });
  });

  it("does not treat JSON arrays as custom result objects", () => {
    expect(getAttemptCompletionResultDisplay("[1,2,3]")).toEqual({
      type: "markdown",
      content: "[1,2,3]",
    });
  });
});

describe("isAttemptTodoCompletionRejected", () => {
  it("detects rejected attemptTodoCompletion JSON string results", () => {
    expect(
      isAttemptTodoCompletionRejected({
        type: "tool-newTask",
        state: "output-available",
        input: {
          agentType: "attemptTodoCompletion",
        },
        output: {
          result: JSON.stringify({
            success: false,
            summary: "More work remains.",
          }),
        },
      } as any),
    ).toBe(true);
  });

  it("does not reject successful attemptTodoCompletion results", () => {
    expect(
      isAttemptTodoCompletionRejected({
        type: "tool-newTask",
        state: "output-available",
        input: {
          agentType: "attemptTodoCompletion",
        },
        output: {
          result: {
            success: true,
            summary: "Done.",
          },
        },
      } as any),
    ).toBe(false);
  });
});
