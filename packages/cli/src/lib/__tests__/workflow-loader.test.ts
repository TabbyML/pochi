import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { loadWorkflow, isWorkflowReference, extractWorkflowName } from "../workflow-loader";

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

  describe("loadWorkflow", () => {
    it("should load workflow content when workflow exists", async () => {
      const workflowName = "test-workflow";
      const workflowContent = "This is a test workflow";
      const workflowPath = path.join(tempDir, ".pochi", "workflows", `${workflowName}.md`);
      
      await fs.writeFile(workflowPath, workflowContent);
      
      const result = await loadWorkflow(workflowName, tempDir);
      expect(result).toBe(workflowContent);
    });

    it("should return null when workflow does not exist", async () => {
      const result = await loadWorkflow("non-existent", tempDir);
      expect(result).toBeNull();
    });

    it("should return null when workflow file cannot be read", async () => {
      // Create a directory with the same name as a workflow file would have
      const workflowPath = path.join(tempDir, ".pochi", "workflows", "test-workflow.md");
      await fs.mkdir(workflowPath, { recursive: true });
      
      const result = await loadWorkflow("test-workflow", tempDir);
      expect(result).toBeNull();
    });
  });

  describe("isWorkflowReference", () => {
    it("should return true for workflow references", () => {
      expect(isWorkflowReference("/create-pr")).toBe(true);
      expect(isWorkflowReference("/workflow-name")).toBe(true);
    });

    it("should return false for regular prompts", () => {
      expect(isWorkflowReference("Create a PR")).toBe(false);
      expect(isWorkflowReference("This is a prompt")).toBe(false);
      expect(isWorkflowReference("")).toBe(false);
    });
  });

  describe("extractWorkflowName", () => {
    it("should extract workflow name from reference", () => {
      expect(extractWorkflowName("/create-pr")).toBe("create-pr");
      expect(extractWorkflowName("/workflow-name")).toBe("workflow-name");
    });
  });
});