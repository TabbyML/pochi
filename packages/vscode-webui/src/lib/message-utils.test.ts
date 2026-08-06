import { prompts } from "@getpochi/common";
import type { ValidSkillFile } from "@getpochi/common/vscode-webui-bridge";
import type { TFunction } from "i18next";
import { describe, expect, it, vi } from "vitest";
import { prepareMessageParts } from "./message-utils";

vi.mock("./vscode", () => ({
  vscodeHost: { deleteReviews: vi.fn() },
}));

describe("prepareMessageParts", () => {
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
    );

    expect(parts).toEqual([
      { type: "text", text: prompts.skillSystemReminder(skill) },
      { type: "text", text: "/deploy" },
    ]);
  });
});
