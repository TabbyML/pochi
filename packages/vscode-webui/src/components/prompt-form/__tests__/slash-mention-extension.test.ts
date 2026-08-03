import { describe, expect, it } from "vitest";
import { renderSlashMentionText } from "../slash-mention/extension";

describe("renderSlashMentionText", () => {
  it("expands a selected skill directly into its instructions", () => {
    const result = renderSlashMentionText({
      type: "skill",
      id: "deploy",
      path: "/skills/deploy/SKILL.md",
      rawData: {
        name: "deploy",
        description: "Deploy the application",
        filePath: "/skills/deploy/SKILL.md",
        instructions: "Run the deployment workflow.",
        disableModelInvocation: true,
      },
    });

    expect(result).toContain("Run the deployment workflow.");
    expect(result).toContain('Do not call the useSkill tool for "deploy"');
    expect(result).not.toContain("Please use the useSkill tool");
  });
});
