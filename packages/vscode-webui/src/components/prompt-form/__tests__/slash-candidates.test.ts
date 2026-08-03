import type {
  CustomAgentFile,
  SkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import { describe, expect, it } from "vitest";
import { createSlashCandidates } from "../slash-mention/slash-candidates";

describe("createSlashCandidates", () => {
  it("omits widget-guidelines from user slash command skill candidates", () => {
    const customAgents: CustomAgentFile[] = [
      {
        name: "reviewer",
        description: "Review code",
        systemPrompt: "Review the selected code",
        filePath: ".pochi/agents/reviewer.md",
      },
    ];
    const skills: SkillFile[] = [
      {
        name: "create-skill",
        description: "Create a skill",
        instructions: "Create skill instructions",
        filePath: "/built-in/create-skill.md",
      },
      {
        name: "widget-guidelines",
        description: "Render widget guidelines",
        instructions: "Widget instructions",
        filePath: "/built-in/widget-guidelines/SKILL.md",
        isBuiltIn: true,
      },
    ];

    expect(
      createSlashCandidates(customAgents, skills).map((option) => option.id),
    ).toEqual(["reviewer", "create-skill"]);
  });
});
