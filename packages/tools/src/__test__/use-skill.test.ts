import { describe, expect, it } from "vitest";
import { createSkillTool } from "../use-skill";

const visibleSkill = {
  name: "visible-skill",
  description: "Visible to the model",
  filePath: "/skills/visible-skill/SKILL.md",
  instructions: "Visible instructions",
};

const manualSkill = {
  name: "manual-skill",
  description: "Only users can invoke this skill",
  filePath: "/skills/manual-skill/SKILL.md",
  instructions: "Manual instructions",
  disableModelInvocation: true,
};

describe("createSkillTool", () => {
  it("does not advertise skills with model invocation disabled", () => {
    const tool = createSkillTool([visibleSkill, manualSkill]);

    expect(tool.description).toContain("visible-skill");
    expect(tool.description).not.toContain("manual-skill");
  });

  it("reports no available skills when all skills are manual-only", () => {
    const tool = createSkillTool([manualSkill]);

    expect(tool.description).toContain(
      "No skills are available in the workspace.",
    );
  });
});
