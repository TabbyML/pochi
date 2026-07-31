import { describe, expect, it } from "vitest";
import type { Skill } from "../use-skill";
import { createSkillTool } from "../use-skill";

const skills: Skill[] = [
  {
    name: "model-skill",
    description: "A skill the model can discover",
    filePath: ".pochi/skills/model-skill/SKILL.md",
    instructions: "Model skill instructions",
  },
  {
    name: "user-only-skill",
    description: "A skill only users can invoke",
    filePath: ".pochi/skills/user-only-skill/SKILL.md",
    instructions: "User-only skill instructions",
    disableModelInvocation: true,
  },
];

describe("createSkillTool", () => {
  it("hides skills with model invocation disabled from the tool description", () => {
    const tool = createSkillTool(skills);

    expect(tool.description).toContain("model-skill");
    expect(tool.description).not.toContain("user-only-skill");
  });

  it("allows explicitly invoked hidden skills through skill markers", () => {
    const tool = createSkillTool(skills);

    expect(tool.description).toContain(
      "unless the user's prompt explicitly invokes a skill through a <skill> marker",
    );
  });
});
