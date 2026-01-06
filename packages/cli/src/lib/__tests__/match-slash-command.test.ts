import { describe, expect, it } from "vitest";
import type { Workflow } from "../workflow-loader";
import {
  containsSlashCommandReference,
  extractSlashCommandNames,
  getModelFromSlashCommand,
  replaceSlashCommandReferences,
} from "../match-slash-command";
import type { CustomAgent } from "@getpochi/tools";
import type { ValidCustomAgentFile } from "@getpochi/common/vscode-webui-bridge";

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
      expect(containsSlashCommandReference("/test-workflow check https://example.com/path")).toBe(true);
    });
  });

  describe("extractSlashCommandNames", () => {
    it("should extract slash command names from references", () => {
      expect(extractSlashCommandNames("/create-pr")).toEqual(["create-pr"]);
      expect(extractSlashCommandNames("/workflow-name")).toEqual([
        "workflow-name",
      ]);
      expect(extractSlashCommandNames("please /create-pr")).toEqual([
        "create-pr",
      ]);
      expect(
        extractSlashCommandNames("/create-pr use /test-workflow convention"),
      ).toEqual(["create-pr", "test-workflow"]);
    });

    it("should return empty array for prompts without slash command references", () => {
      expect(extractSlashCommandNames("Create a PR")).toEqual([]);
      expect(extractSlashCommandNames("")).toEqual([]);
    });

    it("should not extract markdown links and images", () => {
      expect(extractSlashCommandNames("[link](https://example.com/path)")).toEqual([]);
      expect(extractSlashCommandNames("![image](https://example.com/image.png)")).toEqual([]);
    });  });

  describe("getModelFromSlashCommand", () => {
    const workflows: Workflow[] = [
      {
        id: "workflow-with-model",
        pathName: ".pochi/workflows/workflow-with-model.md",
        content: "",
        frontmatter: { model: "workflow-model" },
      },
      {
        id: "workflow-without-model",
        pathName: ".pochi/workflows/workflow-without-model.md",
        content: "",
        frontmatter: {},
      },
    ];

    const customAgents: CustomAgent[] = [
      {
        name: "agent-with-model",
        description: "",
        systemPrompt: "",
        model: "agent-model",
      },
      {
        name: "agent-without-model",
        description: "",
        systemPrompt: "",
      },
    ];

    it("should return model from workflow if available", async () => {
      const model = await getModelFromSlashCommand("/workflow-with-model", {
        workflows,
        customAgents,
      });
      expect(model).toBe("workflow-model");
    });

    it("should return model from agent if workflow model is not available", async () => {
      const model = await getModelFromSlashCommand("/agent-with-model", {
        workflows,
        customAgents,
      });
      expect(model).toBe("agent-model");
    });

    it("should return undefined if no model is found", async () => {
      const model = await getModelFromSlashCommand("/workflow-without-model", {
        workflows,
        customAgents,
      });
      expect(model).toBeUndefined();
    });
  });

  describe("replaceSlashCommandReferences", () => {
    const workflows: Workflow[] = [
      {
        id: "test-workflow",
        pathName: ".pochi/workflows/test-workflow.md",
        content: "This is a test workflow",
        frontmatter: {},
      },
    ];

    const customAgents: ValidCustomAgentFile[] = [
      {
        name: "test-agent",
        description: "",
        systemPrompt: "",
        filePath: ".pochi/agents/test-agent.md",
      },
    ];

    it("should replace workflow references with content", async () => {
      const prompt = "Please use /test-workflow for this task";
      const { prompt: result } = await replaceSlashCommandReferences(prompt, {
        workflows,
        customAgents,
      });
      expect(result).toBe(
        'Please use <workflow id="test-workflow" path=".pochi/workflows/test-workflow.md">This is a test workflow</workflow> for this task',
      );
    });

    it("should replace agent references with content", async () => {
      const prompt = "Please use /test-agent for this task";
      const { prompt: result } = await replaceSlashCommandReferences(prompt, {
        workflows,
        customAgents,
      });
      expect(result).toBe(
        'Please use <custom-agent id="test-agent" path=".pochi/agents/test-agent.md">newTask:test-agent</custom-agent> for this task'
      );
    });

    it("should handle multiple slash command references", async () => {
      const prompt = "Use /test-workflow and then /test-agent";
      const { prompt: result } = await replaceSlashCommandReferences(prompt, {
        workflows,
        customAgents,
      });
      expect(result).toBe(
        'Use <workflow id="test-workflow" path=".pochi/workflows/test-workflow.md">This is a test workflow</workflow> and then <custom-agent id="test-agent" path=".pochi/agents/test-agent.md">newTask:test-agent</custom-agent>',
      );
    });
  });
});