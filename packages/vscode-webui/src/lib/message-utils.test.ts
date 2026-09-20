import { prompts } from "@getpochi/common";
import type {
  ActiveSelection,
  ValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import type { TFunction } from "i18next";
import { describe, expect, it, vi } from "vitest";
import { buildTodoModeObjective, prepareMessageParts } from "./message-utils";

vi.mock("./vscode", () => ({
  vscodeHost: { deleteReviews: vi.fn() },
}));

describe("prepareMessageParts", () => {
  it("places invocation reminders directly before user-visible text", () => {
    const prompt =
      'use <custom-agent id="tester" path="/agents/tester.md">/tester</custom-agent> to test this';
    const activeSelection: ActiveSelection = {
      filepath: "/workspace/example.ts",
      range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 1 },
      },
      content: "x",
    };
    const parts = prepareMessageParts(
      ((key: string) => key) as TFunction,
      prompt,
      [],
      [],
      undefined,
      activeSelection,
      undefined,
      undefined,
      ["tester"],
    );

    expect(parts).toEqual([
      { type: "text", text: prompts.customAgentSystemReminder("tester") },
      { type: "text", text: prompt },
      { type: "data-active-selection", data: { activeSelection } },
    ]);
  });

  it("keeps invoked skill instructions separate from user-visible text", () => {
    const skill: ValidSkillFile = {
      name: "deploy",
      description: "Deploy the application",
      filePath: "/skills/deploy/SKILL.md",
      instructions: "Run the deployment workflow.",
    };

    const parts = prepareMessageParts(
      ((key: string) => key) as TFunction,
      "/deploy",
      [],
      [],
      undefined,
      undefined,
      undefined,
      [skill],
      undefined,
    );

    expect(parts).toEqual([
      { type: "text", text: prompts.skillSystemReminder(skill) },
      { type: "text", text: "/deploy" },
    ]);
  });

  it("adds one hidden file reminder and UI-only pasted text parts", () => {
    const pastedTextFiles = [
      { filePath: "/tmp/first.txt", title: "first paste" },
      { filePath: "/tmp/second.txt", title: "second paste" },
    ];
    const parts = prepareMessageParts(
      ((key: string) => key) as TFunction,
      "Analyze these logs",
      [],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      pastedTextFiles,
    );

    expect(parts).toEqual([
      { type: "text", text: "Analyze these logs" },
      {
        type: "text",
        text: prompts.createSystemReminder(
          prompts.pastedTextFileReferences(pastedTextFiles),
        ),
      },
      { type: "data-pasted-text", data: pastedTextFiles[0] },
      { type: "data-pasted-text", data: pastedTextFiles[1] },
    ]);
  });
});

describe("buildTodoModeObjective", () => {
  it("uses pasted text file references when the visible prompt is empty", () => {
    const files = [{ filePath: "/tmp/pasted.txt", title: "large paste" }];

    expect(buildTodoModeObjective("", files)).toBe(
      prompts.pastedTextFileReferences(files),
    );
  });

  it("keeps the visible prompt before pasted text file references", () => {
    const files = [
      { filePath: "/tmp/first.txt", title: "first paste" },
      { filePath: "/tmp/second.txt", title: "second paste" },
    ];

    expect(
      buildTodoModeObjective("Analyze these logs", files),
    ).toBe(
      `Analyze these logs\n\n${prompts.pastedTextFileReferences(files)}`,
    );
  });
});
