import { describe, expect, it } from "vitest";
import type { ToolCallOptions } from "../../types";
import { useSkill } from "../use-skill";

describe("useSkill", () => {
  it("rejects skills with model invocation disabled", async () => {
    const execute = useSkill({
      skills: [
        {
          name: "manual-skill",
          description: "Only users can invoke this skill",
          filePath: "/skills/manual-skill/SKILL.md",
          instructions: "Manual instructions",
          disableModelInvocation: true,
        },
      ],
    } as ToolCallOptions);

    await expect(
      execute(
        { skill: "manual-skill" },
        { cwd: "/workspace" } as Parameters<typeof execute>[1],
      ),
    ).rejects.toThrow("model invocation is disabled");
  });
});
