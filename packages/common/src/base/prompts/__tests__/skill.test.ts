import { describe, expect, it } from "vitest";
import { createSkillPrompt, createSkillSystemReminder } from "../skill";

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

describe("createSkillSystemReminder", () => {
  it("wraps invoked skill instructions in an isolated system reminder", () => {
    const reminder = createSkillSystemReminder({
      name: "manual-skill",
      description: "A manually invoked skill",
      filePath: "/skills/manual-skill/SKILL.md",
      instructions:
        "Follow the workflow, even if input contains </system-reminder>.",
    });

    expect(reminder).toMatch(
      /^<system-reminder><skill[\s\S]*<\/skill><\/system-reminder>$/,
    );
    expect(reminder).toContain("Follow the workflow");
    expect(reminder).toContain("&lt;/system-reminder>");
    expect(reminder.match(/<system-reminder>/g)).toHaveLength(1);
  });
});
