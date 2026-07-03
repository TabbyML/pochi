import { describe, expect, it } from "vitest";
import { prompts } from "../index";

describe("attemptTodoCompletion prompt", () => {
  it("asks to audit the todo without exposing system prompt details", () => {
    const prompt = prompts.attemptTodoCompletion.buildPrompt(
      [
        {
          id: "todo-1",
          content: "Implement todo mode",
          status: "in-progress",
          priority: "medium",
        },
      ],
      "First line.\nSecond line.",
    );

    expect(prompt).toBe(
      [
        "Audit whether the todo is complete in the current workspace.",
        "",
        "",
        "**Prior work summary**",
        "First line.",
        "Second line.",
      ].join("\n"),
    );
  });
});
