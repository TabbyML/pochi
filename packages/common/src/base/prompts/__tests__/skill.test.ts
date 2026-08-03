import { describe, expect, it } from "vitest";
import { createSkillPrompt } from "../skill";

describe("createSkillPrompt", () => {
  it("directly expands skill instructions and tool restrictions", () => {
    const prompt = createSkillPrompt({
      name: "manual-skill",
      description: "A manually invoked skill",
      filePath: "/skills/manual-skill/SKILL.md",
      instructions: "Follow the manual workflow.",
      allowedTools: "readFile executeCommand",
      disableModelInvocation: true,
    });

    expect(prompt).toContain("Follow the manual workflow.");
    expect(prompt).toContain(
      "restricted to use only the following tools: readFile executeCommand",
    );
    expect(prompt).toContain(
      'Do not call the useSkill tool for "manual-skill"',
    );
    expect(prompt).not.toContain("Please use the useSkill tool");
  });
});
