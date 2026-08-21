import { describe, expect, it } from "vitest";
import { renderSlashMentionText } from "../slash-mention/extension";

describe("renderSlashMentionText", () => {
  it("renders a selected custom agent as an empty structured tag", () => {
    const result = renderSlashMentionText({
      type: "custom-agent",
      id: "tester",
      path: "/agents/tester.md",
      rawData: {
        name: "tester",
        description: "Run test tasks",
        systemPrompt: "Test the requested behavior.",
      },
    });

    expect(result).toBe(
      '<custom-agent id="tester" path="/agents/tester.md"></custom-agent>',
    );
  });

  it("keeps a selected skill as concise user-visible text", () => {
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

    expect(result).toBe("/deploy");
  });

  it("does not render from untrusted skill metadata", () => {
    const result = renderSlashMentionText({
      type: "skill",
      id: "deploy",
      path: "/skills/deploy/SKILL.md",
      rawData: undefined as never,
    });

    expect(result).toBe("/deploy");
  });
});
