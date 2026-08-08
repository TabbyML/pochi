import { describe, expect, it } from "vitest";
import {
  containsSlashCommandReference,
  extractSlashCommandNames,
  replaceSlashCommandReferences,
} from "../match-slash-command";
import type {
  ValidCustomAgentFile,
  ValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";

describe("match-slash-command", () => {

  describe("containsSlashCommandReference", () => {
    it("should return true for prompts containing slash command references", () => {
      expect(containsSlashCommandReference("/create-pr")).toBe(true);
      expect(containsSlashCommandReference("/workflow-name")).toBe(true);
      expect(containsSlashCommandReference("please /create-pr")).toBe(true);
      expect(
        containsSlashCommandReference("/create-pr use feat semantic convention"),
      ).toBe(true);
    });

    it("should return false for regular prompts", () => {
      expect(containsSlashCommandReference("Create a PR")).toBe(false);
      expect(containsSlashCommandReference("This is a prompt")).toBe(false);
      expect(containsSlashCommandReference("")).toBe(false);
    });

    it("should not match markdown links and images", () => {
      expect(containsSlashCommandReference("[link text](https://example.com/path)")).toBe(false);
      expect(containsSlashCommandReference("![alt text](https://example.com/image.png)")).toBe(false);
    });

    it("should not match code blocks or inline code", () => {
      expect(containsSlashCommandReference("`/some/path`")).toBe(false);
      expect(containsSlashCommandReference("```\n/path/to/file\n```")).toBe(false);
    });

    it("should not match HTML closing tags", () => {
      expect(containsSlashCommandReference("</div>")).toBe(false);
      expect(containsSlashCommandReference("</workflow>")).toBe(false);
    });

    it("should match slash commands even with URLs present", () => {
      expect(containsSlashCommandReference("Use /create-pr and visit https://workflow-a.com")).toBe(true);
      expect(containsSlashCommandReference("/test-agent check https://example.com/path")).toBe(true);
    });
  });

  describe("extractSlashCommandNames", () => {
    it("should extract slash command names from references", () => {
      expect(extractSlashCommandNames("/create-pr")).toEqual(["create-pr"]);
      expect(extractSlashCommandNames("/agent-name")).toEqual([
        "agent-name",
      ]);
      expect(extractSlashCommandNames("please /create-pr")).toEqual([
        "create-pr",
      ]);
      expect(
        extractSlashCommandNames("/create-pr use /test-agent convention"),
      ).toEqual(["create-pr", "test-agent"]);
    });


    it("should return empty array for prompts without slash command references", () => {
      expect(extractSlashCommandNames("Create a PR")).toEqual([]);
      expect(extractSlashCommandNames("")).toEqual([]);
    });

    it("should not extract markdown links and images", () => {
      expect(extractSlashCommandNames("[link](https://example.com/path)")).toEqual([]);
      expect(extractSlashCommandNames("![image](https://example.com/image.png)")).toEqual([]);
    });  });

  describe("replaceSlashCommandReferences", () => {
    const customAgents: ValidCustomAgentFile[] = [
      {
        name: "test-agent",
        description: "",
        systemPrompt: "",
        filePath: ".pochi/agents/test-agent.md",
      },
    ];

    const skills: ValidSkillFile[] = [
      {
        name: "test-skill",
        description: "A test skill for testing slash command functionality",
        instructions: "This is a test skill",
        filePath: ".pochi/skills/test-skill/SKILL.md",
      },
    ];

    it("should replace agent references with content", async () => {

      const prompt = "Please use /test-agent for this task";
      const { prompt: result } = await replaceSlashCommandReferences(prompt, {
        customAgents,
        skills,
      });
      expect(result).toBe(
        'Please use <custom-agent id="test-agent" path=".pochi/agents/test-agent.md">Please use the newTask tool to run test-agent to complete the following request:\n</custom-agent> for this task'
      );
    });

    it("should replace skill references with content", async () => {
      const prompt = "Please use /test-skill for this task";
      const { prompt: result } = await replaceSlashCommandReferences(prompt, {
        customAgents,
        skills,
      });
      expect(result).toContain(
        'Please use <skill id="test-skill" path=".pochi/skills/test-skill/SKILL.md" data-user-invoked="true">',
      );
      expect(result).toContain("This is a test skill");
      expect(result).toContain("</skill> for this task");
    });

    it("should handle multiple slash command references", async () => {
      const prompt = "Use /test-agent and then /test-skill";
      const { prompt: result } = await replaceSlashCommandReferences(prompt, {
        customAgents,
        skills,
      });
      expect(result).toContain('<custom-agent id="test-agent"');
      expect(result).toContain('and then <skill id="test-skill"');
      expect(result).toContain("This is a test skill");
    });

    it("expands user-invocable skills with model invocation disabled", async () => {
      const { prompt: result } = await replaceSlashCommandReferences(
        "/test-skill",
        {
          customAgents,
          skills: [{ ...skills[0], disableModelInvocation: true }],
        },
      );

      expect(result).toContain("This is a test skill");
      expect(result).toContain('Do not call the useSkill tool for "test-skill"');
      expect(result).not.toContain("Please use the useSkill tool");
    });

    it("reports skills that are not user-invocable", async () => {
      const result = await replaceSlashCommandReferences("/test-skill", {
        customAgents,
        skills: [{ ...skills[0], userInvocable: false }],
      });

      expect(result.prompt).toBe("/test-skill");
      expect(result.blockedSkill?.name).toBe("test-skill");
    });

    it("prefers a custom agent over a blocked skill with the same name", async () => {
      const result = await replaceSlashCommandReferences("/test-agent", {
        customAgents,
        skills: [
          {
            ...skills[0],
            name: "test-agent",
            userInvocable: false,
          },
        ],
      });

      expect(result.prompt).toContain('<custom-agent id="test-agent"');
      expect(result.blockedSkill).toBeUndefined();
    });
  });
});
