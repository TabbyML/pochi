import { describe, expect, it } from "vitest";
import { hasNewTaskResult } from "../new-task/result";

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
