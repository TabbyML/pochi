import { prompts } from "@getpochi/common";
import type { ValidSkillFile } from "@getpochi/common/vscode-webui-bridge";
import type { TFunction } from "i18next";
import { describe, expect, it, vi } from "vitest";
import { prepareMessageParts } from "./message-utils";

vi.mock("./vscode", () => ({
  vscodeHost: { deleteReviews: vi.fn() },
}));

describe("prepareMessageParts", () => {
  it("keeps invoked custom agent instructions separate from user-visible text", () => {
    const prompt =
      'use <custom-agent id="tester" path="/agents/tester.md"></custom-agent> to test this';
    const parts = prepareMessageParts(
      ((key: string) => key) as TFunction,
      prompt,
      [],
      [],
      undefined,
      undefined,
      undefined,
      undefined,
      ["tester"],
    );

    expect(parts).toEqual([
      { type: "text", text: prompts.customAgentSystemReminder("tester") },
      { type: "text", text: prompt },
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
});
