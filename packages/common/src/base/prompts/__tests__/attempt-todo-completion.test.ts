import { describe, expect, it } from "vitest";
import { prompts } from "../index";

describe("attemptTodoCompletion prompt", () => {
  it("renders the active todo and quotes the prior summary", () => {
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
        "Audit whether the todo below is satisfied in the current workspace:",
        "Implement todo mode",
        "",
        "> Prior work summary",
        "> First line.",
        "> Second line.",
        "",
        "**Verification rule**",
        "Treat the summary as context, not proof. Verify the current workspace state before deciding the todo status.",
      ].join("\n"),
    );
  });
});
