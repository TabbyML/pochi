import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { containsWorkflowReference, extractWorkflowNames, replaceWorkflowReferences } from "../workflow-loader";

describe("workflow-loader", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pochi-test-"));
    
    // Create .pochi/workflows directory structure
    const workflowsDir = path.join(tempDir, ".pochi", "workflows");
    await fs.mkdir(workflowsDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up the temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("containsWorkflowReference", () => {
    it("should return true for prompts containing workflow references", () => {
      expect(containsWorkflowReference("/create-pr")).toBe(true);
      expect(containsWorkflowReference("/workflow-name")).toBe(true);
      expect(containsWorkflowReference("please /create-pr")).toBe(true);
      expect(containsWorkflowReference("/create-pr use feat semantic convention")).toBe(true);
    });

    it("should return false for regular prompts", () => {
      expect(containsWorkflowReference("Create a PR")).toBe(false);
      expect(containsWorkflowReference("This is a prompt")).toBe(false);
      expect(containsWorkflowReference("")).toBe(false);
    });
  });

  describe("extractWorkflowNames", () => {
    it("should extract workflow names from references", () => {
      expect(extractWorkflowNames("/create-pr")).toEqual(["create-pr"]);
      expect(extractWorkflowNames("/workflow-name")).toEqual(["workflow-name"]);
      expect(extractWorkflowNames("please /create-pr")).toEqual(["create-pr"]);
      expect(extractWorkflowNames("/create-pr use /test-workflow convention")).toEqual(["create-pr", "test-workflow"]);
    });

    it("should return empty array for prompts without workflow references", () => {
      expect(extractWorkflowNames("Create a PR")).toEqual([]);
      expect(extractWorkflowNames("")).toEqual([]);
    });
  });

  describe("replaceWorkflowReferences", () => {
    it("should replace workflow references with content", async () => {
      const workflowContent = "This is a test workflow";
      const workflowPath = path.join(tempDir, ".pochi", "workflows", "test-workflow.md");
      await fs.writeFile(workflowPath, workflowContent);

      const prompt = "Please use /test-workflow for this task";
      const { prompt: result, missingWorkflows } = await replaceWorkflowReferences(prompt, tempDir);
      
      expect(result).toBe(`Please use <workflow id="test-workflow" path="${path.relative(tempDir, workflowPath)}" model="">This is a test workflow</workflow> for this task`);
      expect(missingWorkflows).toEqual([]);
    });

    it("should handle multiple workflow references", async () => {
      const workflowContent1 = "Workflow 1 content";
      const workflowContent2 = "Workflow 2 content";
      
      const workflowPath1 = path.join(tempDir, ".pochi", "workflows", "workflow1.md");
      const workflowPath2 = path.join(tempDir, ".pochi", "workflows", "workflow2.md");
      
      await fs.writeFile(workflowPath1, workflowContent1);
      await fs.writeFile(workflowPath2, workflowContent2);

      const prompt = "Use /workflow1 and then /workflow2";
      const { prompt: result, missingWorkflows } = await replaceWorkflowReferences(prompt, tempDir);
      
      expect(result).toBe(`Use <workflow id="workflow1" path="${path.relative(tempDir, workflowPath1)}" model="">Workflow 1 content</workflow> and then <workflow id="workflow2" path="${path.relative(tempDir, workflowPath2)}" model="">Workflow 2 content</workflow>`);
      expect(missingWorkflows).toEqual([]);
    });

    it("should track missing workflows", async () => {
      const prompt = "Please use /non-1-existent for this task";
      const { prompt: result, missingWorkflows } = await replaceWorkflowReferences(prompt, tempDir);
      
      expect(result).toBe(prompt); // Should remain unchanged
      expect(missingWorkflows).toEqual(["non-1-existent"]);
    });

    it("should handle prompts without workflow references", async () => {
      const prompt = "This is a regular prompt without workflows";
      const { prompt: result, missingWorkflows } = await replaceWorkflowReferences(prompt, tempDir);
      
      expect(result).toBe(prompt);
      expect(missingWorkflows).toEqual([]);
    });

    it("should include the model from frontmatter in the replaced content", async () => {
      const workflowContent = `
---
model: my-special-model
---

This is a workflow with a model.
      `.trim();
      const workflowPath = path.join(tempDir, ".pochi", "workflows", "model-workflow.md");
      await fs.writeFile(workflowPath, workflowContent);

      const prompt = "Use /model-workflow";
      const { prompt: result, missingWorkflows } = await replaceWorkflowReferences(prompt, tempDir);

      const expected = `Use <workflow id="model-workflow" path="${path.relative(tempDir, workflowPath)}" model="my-special-model">---\nmodel: my-special-model\n---\n\nThis is a workflow with a model.</workflow>`;
      expect(result).toBe(expected);
      expect(missingWorkflows).toEqual([]);
    });
  });
});
