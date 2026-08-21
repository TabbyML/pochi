import type {
  ValidCustomAgentFile,
  ValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import { describe, expect, it } from "vitest";
import {
  containsSlashCommandReference,
  extractSlashCommandNames,
  replaceSlashCommandReferences,
} from "../match-slash-command";

describe("match-slash-command", () => {
  describe("containsSlashCommandReference", () => {
    it("detects slash commands at the start of a prompt", () => {
      expect(containsSlashCommandReference("/create-pr")).toBe(true);
      expect(containsSlashCommandReference("  /workflow-name run it")).toBe(
        true,
      );
      expect(containsSlashCommandReference("/skill-a /skill-b do XYZ")).toBe(
        true,
      );
    });

    it("does not detect slash commands after ordinary text", () => {
      expect(containsSlashCommandReference("please /create-pr")).toBe(false);
      expect(
        containsSlashCommandReference(
          "Use /create-pr and visit https://workflow-a.com",
        ),
      ).toBe(false);
    });

    it("does not match paths, URLs, or regular prompts", () => {
      expect(containsSlashCommandReference("Create a PR")).toBe(false);
      expect(containsSlashCommandReference("src/create-pr/index.ts")).toBe(
        false,
      );
      expect(containsSlashCommandReference("./create-pr")).toBe(false);
      expect(containsSlashCommandReference("../create-pr")).toBe(false);
      expect(containsSlashCommandReference("/usr/bin/env node")).toBe(false);
      expect(containsSlashCommandReference("C:\\create-pr\\index.ts")).toBe(
        false,
      );
      expect(containsSlashCommandReference("https://example.com/path")).toBe(
        false,
      );
      expect(containsSlashCommandReference("")).toBe(false);
    });

    it("does not match markdown links, images, or code", () => {
      expect(
        containsSlashCommandReference("[link text](https://example.com/path)"),
      ).toBe(false);
      expect(
        containsSlashCommandReference(
          "![alt text](https://example.com/image.png)",
        ),
      ).toBe(false);
      expect(containsSlashCommandReference("`/some/path`")).toBe(false);
      expect(
        containsSlashCommandReference("```\n/path/to/file\n```"),
      ).toBe(false);
      expect(containsSlashCommandReference("</workflow>")).toBe(false);
    });
  });

  describe("extractSlashCommandNames", () => {
    it("extracts a leading chain of slash commands", () => {
      expect(extractSlashCommandNames("/create-pr")).toEqual(["create-pr"]);
      expect(extractSlashCommandNames("  /skill-a /skill-b do XYZ")).toEqual([
        "skill-a",
        "skill-b",
      ]);
    });

    it("stops extracting when command arguments begin", () => {
      expect(
        extractSlashCommandNames("/create-pr use /test-agent convention"),
      ).toEqual(["create-pr"]);
      expect(extractSlashCommandNames("please /create-pr")).toEqual([]);
    });

    it("limits a leading command chain to six entries", () => {
      expect(
        extractSlashCommandNames("/a /b /c /d /e /f /g do the task"),
      ).toEqual(["a", "b", "c", "d", "e", "f"]);
    });

    it("does not extract path segments", () => {
      expect(extractSlashCommandNames("src/create-pr/index.ts")).toEqual([]);
      expect(extractSlashCommandNames("./create-pr")).toEqual([]);
      expect(extractSlashCommandNames("../create-pr")).toEqual([]);
      expect(extractSlashCommandNames("/usr/bin/env")).toEqual([]);
      expect(extractSlashCommandNames("/create-pr/index.ts")).toEqual([]);
    });
  });

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

    it("replaces a leading agent reference with a structured marker", async () => {
      const result = await replaceSlashCommandReferences(
        "/test-agent Please handle this task",
        { customAgents, skills },
      );

      expect(result.prompt).toBe(
        '<custom-agent id="test-agent" path=".pochi/agents/test-agent.md"></custom-agent> Please handle this task',
      );
      expect(result.invokedCustomAgents).toEqual(["test-agent"]);
    });

    it("replaces a leading skill reference with content", async () => {
      const { prompt } = await replaceSlashCommandReferences(
        "/test-skill Please handle this task",
        { customAgents, skills },
      );

      expect(prompt).toContain(
        '<skill id="test-skill" path=".pochi/skills/test-skill/SKILL.md" data-user-invoked="true">',
      );
      expect(prompt).toContain("This is a test skill");
      expect(prompt).toContain("</skill> Please handle this task");
    });

    it("handles a leading chain of slash command references", async () => {
      const { prompt } = await replaceSlashCommandReferences(
        "/test-agent /test-skill Use both",
        { customAgents, skills },
      );

      expect(prompt).toContain('<custom-agent id="test-agent"');
      expect(prompt).toContain('<skill id="test-skill"');
      expect(prompt).toContain("This is a test skill");
      expect(prompt).toContain("Use both");
    });

    it("deduplicates repeated leading agent references", async () => {
      const result = await replaceSlashCommandReferences(
        "/test-agent /test-agent do the task",
        { customAgents, skills },
      );

      expect(result.invokedCustomAgents).toEqual(["test-agent"]);
    });

    it("does not replace slash references after arguments begin", async () => {
      const prompt = "/test-agent inspect src/test-skill and /test-skill";
      const result = await replaceSlashCommandReferences(prompt, {
        customAgents,
        skills,
      });

      expect(result.prompt).toContain('<custom-agent id="test-agent"');
      expect(result.prompt).toContain("src/test-skill and /test-skill");
      expect(result.prompt).not.toContain('<skill id="test-skill"');
    });

    it("does not replace paths whose segments match known commands", async () => {
      const prompts = [
        "src/test-skill/index.ts",
        "./test-skill",
        "../test-skill",
        "/test-skill/index.ts",
        "/usr/bin/test-skill",
        "C:\\test-skill\\index.ts",
        "https://example.com/test-skill",
      ];

      for (const prompt of prompts) {
        await expect(
          replaceSlashCommandReferences(prompt, { customAgents, skills }),
        ).resolves.toEqual({ prompt, invokedCustomAgents: [] });
      }
    });

    it("stops a command chain at the first unknown command", async () => {
      const prompt = "/unknown /test-skill do the task";
      await expect(
        replaceSlashCommandReferences(prompt, { customAgents, skills }),
      ).resolves.toEqual({ prompt, invokedCustomAgents: [] });
    });

    it("expands user-invocable skills with model invocation disabled", async () => {
      const { prompt } = await replaceSlashCommandReferences("/test-skill", {
        customAgents,
        skills: [{ ...skills[0], disableModelInvocation: true }],
      });

      expect(prompt).toContain("This is a test skill");
      expect(prompt).toContain('Do not call the useSkill tool for "test-skill"');
      expect(prompt).not.toContain("Please use the useSkill tool");
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
