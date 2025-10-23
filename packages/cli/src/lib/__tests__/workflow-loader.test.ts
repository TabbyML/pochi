import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { loadWorkflows } from "../workflow-loader";

describe("workflow-loader", () => {
  let tempDir: string;
  let globalTempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "pochi-test-"));
    const workflowsDir = path.join(tempDir, ".pochi", "workflows");
    await fs.mkdir(workflowsDir, { recursive: true });

    globalTempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "pochi-global-test-"),
    );
    const globalWorkflowsDir = path.join(globalTempDir, ".pochi", "workflows");
    await fs.mkdir(globalWorkflowsDir, { recursive: true });

    vi.spyOn(os, "homedir").mockReturnValue(globalTempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(globalTempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("loadWorkflows", () => {
    it("should load workflows from the local project directory", async () => {
      const workflowContent = "---\nmodel: test-model\n---\nHello";
      await fs.writeFile(
        path.join(tempDir, ".pochi", "workflows", "local-workflow.md"),
        workflowContent,
      );

      const workflows = await loadWorkflows(tempDir);

      expect(workflows).toHaveLength(1);
      expect(workflows[0]).toMatchObject({
        id: "local-workflow",
        content: workflowContent,
        pathName: ".pochi/workflows/local-workflow.md",
        frontmatter: { model: "test-model" },
      });
    });

    it("should load workflows from the global directory", async () => {
      const workflowContent = "---\nmodel: global-model\n---\nHello Global";
      await fs.writeFile(
        path.join(globalTempDir, ".pochi", "workflows", "global-workflow.md"),
        workflowContent,
      );

      const workflows = await loadWorkflows(tempDir);

      expect(workflows).toHaveLength(1);
      expect(workflows[0]).toMatchObject({
        id: "global-workflow",
        content: workflowContent,
        pathName: ".pochi/workflows/global-workflow.md",
        frontmatter: { model: "global-model" },
      });
    });

    it("should prioritize local workflows over global ones with the same id", async () => {
      const localContent = "---\nmodel: local\n---\nLocal";
      await fs.writeFile(
        path.join(tempDir, ".pochi", "workflows", "shared.md"),
        localContent,
      );

      const globalContent = "---\nmodel: global\n---\nGlobal";
      await fs.writeFile(
        path.join(globalTempDir, ".pochi", "workflows", "shared.md"),
        globalContent,
      );

      const workflows = await loadWorkflows(tempDir);

      expect(workflows).toHaveLength(1);
      expect(workflows[0]).toMatchObject({
        id: "shared",
        content: localContent, // Should be local content
        frontmatter: { model: "local" },
      });
    });

    it("should not load from global directory if includeGlobalWorkflows is false", async () => {
      const globalContent = "Global";
      await fs.writeFile(
        path.join(globalTempDir, ".pochi", "workflows", "global-only.md"),
        globalContent,
      );

      const workflows = await loadWorkflows(tempDir, false);

      expect(workflows).toHaveLength(0);
    });

    it("should return an empty array if no workflows are found", async () => {
      const workflows = await loadWorkflows(tempDir);
      expect(workflows).toEqual([]);
    });
  });
});

