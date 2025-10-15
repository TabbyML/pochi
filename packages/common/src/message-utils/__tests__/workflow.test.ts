import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { extractWorkflowBashCommands, isWorkflowTextPart } from "../workflow";

describe("extractWorkflowBashCommands", () => {
  it("should extract bash commands from a workflow", () => {
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

    const commands = extractWorkflowBashCommands(message);

    expect(commands).toEqual(["git status", "git diff HEAD"]);
  });

  it("should handle messages with no workflows", () => {
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

    const commands = extractWorkflowBashCommands(message);

    expect(commands).toEqual([]);
  });

  it("should handle workflows with no bash commands", () => {
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

    const commands = extractWorkflowBashCommands(message);

    expect(commands).toEqual([]);
  });

  it("should handle multiple workflow parts", () => {
    const message: UIMessage = {
      id: "1",
      role: "user",
      parts: [
        {
          type: "text",
          text: `<workflow>First command: !\`command1\`</workflow>`,
        },
        {
          type: "text",
          text: "Some text in between",
        },
        {
          type: "text",
          text: `<workflow>Second command: !\`command2\`</workflow>`,
        },
      ],
    };

    const commands = extractWorkflowBashCommands(message);
    expect(commands).toEqual(["command1", "command2"]);
  });
});

describe("isWorkflowTextPart", () => {
  it("should return true for a text part containing a workflow", () => {
    const part = {
      type: "text" as const,
      text: `<workflow>some content</workflow>`,
    };
    expect(isWorkflowTextPart(part)).toBe(true);
  });

  it("should return false for a text part without a workflow", () => {
    const part = {
      type: "text" as const,
      text: "just some text",
    };
    expect(isWorkflowTextPart(part)).toBe(false);
  });

  it("should return false for a non-text part", () => {
    const part = {
      type: "tool-call" as const,
      toolName: "test",
      args: {},
    };
    // @ts-expect-error - testing invalid part type
    expect(isWorkflowTextPart(part)).toBe(false);
  });

  it("should handle complex workflow tags", () => {
    const part = {
      type: "text" as const,
      text: `<workflow id="test-workflow" path=".pochi/workflows/test.md">
This workflow has no bash commands.
</workflow>`,
    };
    expect(isWorkflowTextPart(part)).toBe(true);
  });
});

