import type { UIMessage } from "ai";
import { describe, expect, it, vi } from "vitest";
import { executeWorkflowBashCommands } from "../workflow";

describe("executeWorkflowBashCommands", () => {
  it("should extract and execute bash commands from a workflow", async () => {
    const message: UIMessage = {
      id: "1",
      role: "user",
      parts: [
        {
          type: "text",
          text: `<workflow id="test-workflow" path=".pochi/workflows/test.md">
## Context
- Current git status: !\`git status\`
- Current git diff (staged and unstaged changes): !\`git diff HEAD\`
## Task
Create a git commit.
</workflow>`,
        },
      ],
    };

    const bashCommandExecutor = vi.fn(async (command: string) => {
      if (command === "git status") {
        return { output: "git status output" };
      }
      if (command === "git diff HEAD") {
        return { output: "git diff HEAD output" };
      }
      return { output: "" };
    });

    const abortController = new AbortController();
    const results = await executeWorkflowBashCommands(
      message,
      bashCommandExecutor,
      abortController.signal,
    );

    expect(bashCommandExecutor).toHaveBeenCalledTimes(2);
    expect(bashCommandExecutor).toHaveBeenCalledWith("git status", expect.any(Object));
    expect(bashCommandExecutor).toHaveBeenCalledWith("git diff HEAD", expect.any(Object));
    expect(results).toEqual([
      { command: "git status", output: "git status output" },
      { command: "git diff HEAD", output: "git diff HEAD output" },
    ]);
  });

  it("should handle messages with no workflows", async () => {
    const message: UIMessage = {
      id: "1",
      role: "user",
      parts: [
        {
          type: "text",
          text: "This is a regular message with no workflows.",
        },
      ],
    };

    const bashCommandExecutor = vi.fn();
    const abortController = new AbortController();
    const results = await executeWorkflowBashCommands(
      message,
      bashCommandExecutor,
      abortController.signal,
    );

    expect(bashCommandExecutor).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it("should handle workflows with no bash commands", async () => {
    const message: UIMessage = {
      id: "1",
      role: "user",
      parts: [
        {
          type: "text",
          text: `<workflow id="test-workflow" path=".pochi/workflows/test.md">
This workflow has no bash commands.
</workflow>`,
        },
      ],
    };

    const bashCommandExecutor = vi.fn();
    const abortController = new AbortController();
    const results = await executeWorkflowBashCommands(
      message,
      bashCommandExecutor,
      abortController.signal,
    );

    expect(bashCommandExecutor).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });
});
