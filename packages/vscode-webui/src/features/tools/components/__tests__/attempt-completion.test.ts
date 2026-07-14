import { describe, expect, it } from "vitest";
import {
  getAttemptCompletionResultDisplay,
  isAttemptTodoCompletionUnsuccessful,
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

describe("isAttemptTodoCompletionUnsuccessful", () => {
  it("detects unresolved attemptTodoCompletion JSON string results", () => {
    expect(
      isAttemptTodoCompletionUnsuccessful({
        type: "tool-newTask",
        state: "output-available",
        input: {
          agentType: "attemptTodoCompletion",
        },
        output: {
          result: JSON.stringify({
            summary: "More work remains.",
            todos: [
              {
                id: "todo-1",
                content: "Add one test",
                status: "in-progress",
                priority: "medium",
              },
            ],
          }),
        },
      } as any),
    ).toBe(true);
  });

  it("detects unavailable attemptTodoCompletion results", () => {
    expect(
      isAttemptTodoCompletionUnsuccessful({
        type: "tool-newTask",
        state: "output-available",
        input: {
          agentType: "attemptTodoCompletion",
        },
        output: {
          result: "not valid audit output",
        },
      } as any),
    ).toBe(true);
  });

  it("does not reject resolved attemptTodoCompletion results", () => {
    expect(
      isAttemptTodoCompletionUnsuccessful({
        type: "tool-newTask",
        state: "output-available",
        input: {
          agentType: "attemptTodoCompletion",
        },
        output: {
          result: {
            summary: "Done.",
            todos: [
              {
                id: "todo-1",
                content: "Add one test",
                status: "completed",
                priority: "medium",
              },
            ],
          },
        },
      } as any),
    ).toBe(false);
  });
});
