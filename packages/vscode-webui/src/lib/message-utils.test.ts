import { prompts } from "@getpochi/common";
import type {
  ActiveSelection,
  ValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import type { TFunction } from "i18next";
import { describe, expect, it, vi } from "vitest";
import { prepareMessageParts } from "./message-utils";

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

  it("appends pasted text after the visible prompt in paste order", () => {
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
      ["first paste", "second paste"],
    );

    expect(parts).toEqual([
      { type: "text", text: "Analyze these logs" },
      { type: "data-pasted-text", data: { text: "first paste" } },
      { type: "data-pasted-text", data: { text: "second paste" } },
    ]);
  });
});
