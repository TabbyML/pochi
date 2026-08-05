import type { Skill } from "@getpochi/tools";
import { describe, expect, it } from "vitest";
import { createUseSkillResult } from "../skill";

const baseSkill: Skill = {
  name: "demo-skill",
  description: "A demo skill",
  filePath: ".pochi/skills/demo-skill/SKILL.md",
  instructions: "Do the thing.",
};

describe("createUseSkillResult", () => {
  it("prepends the skill file path to the result", () => {
    const result = createUseSkillResult(baseSkill);
    expect(result).toContain(
      "Skill location: .pochi/skills/demo-skill/SKILL.md",
    );
    expect(result).toContain("Do the thing.");
  });

  it("keeps tool restriction instructions alongside the path", () => {
    const result = createUseSkillResult({
      ...baseSkill,
      allowedTools: "readFile writeToFile",
    });
    expect(result).toContain("Skill location:");
    expect(result).toContain(
      "This skill is restricted to use only the following tools: readFile writeToFile",
    );
    expect(result).toContain("Do the thing.");
  });

  it("omits the location line when no file path is available", () => {
    const result = createUseSkillResult({ ...baseSkill, filePath: "" });
    expect(result).not.toContain("Skill location:");
    expect(result).toBe("Do the thing.");
  });
});
