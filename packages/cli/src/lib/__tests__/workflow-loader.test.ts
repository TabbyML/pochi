import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { loadWorkflows } from "../workflow-loader";

// Step 1: Hoist a mock function with a default return value. This default is crucial
// to prevent crashes during the module import phase when side-effect-heavy
// modules (like custom-rules.ts) are loaded and call homedir() before
// the test's beforeEach hook has a chance to run.
const { mockHomedir } = vi.hoisted(() => {
  return { mockHomedir: vi.fn().mockReturnValue("/tmp/mock-home-for-import") };
});

// Step 2: Perform a partial mock, keeping original functionality like `tmpdir`
// while replacing `homedir` with our hoisted mock function.
vi.mock("node:os", async (importOriginal) => {
  const originalOs = await importOriginal<typeof os>();
  return {
    ...originalOs,
    homedir: mockHomedir,
  };
});

describe("loadWorkflows", () => {
  let projectDir: string;
  let homeDir: string;

  beforeEach(async () => {
    // Create temporary directories. os.tmpdir() works because of the partial mock.
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "pochi-project-"));
    homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "pochi-home-"));

    // Step 3: For the actual test run, override the default mock value with the real temp path.
    mockHomedir.mockReturnValue(homeDir);

    const projectWorkflowsDir = path.join(projectDir, ".pochi", "workflows");
    await fs.mkdir(projectWorkflowsDir, { recursive: true });

    const globalWorkflowsDir = path.join(homeDir, ".pochi", "workflows");
    await fs.mkdir(globalWorkflowsDir, { recursive: true });

    // Create mock workflow files
    await fs.writeFile(
      path.join(projectWorkflowsDir, "project-workflow.md"),
      "---\nmodel: project-model\n---\nProject workflow content",
    );
    await fs.writeFile(
      path.join(globalWorkflowsDir, "global-workflow.md"),
      "Global workflow content",
    );
    await fs.writeFile(
      path.join(projectWorkflowsDir, "duplicate.md"),
      "Project duplicate content",
    );
    await fs.writeFile(
      path.join(globalWorkflowsDir, "duplicate.md"),
      "Global duplicate content",
    );
  });

  afterEach(async () => {
    // Clean up the temporary directories
    await fs.rm(projectDir, { recursive: true, force: true });
    await fs.rm(homeDir, { recursive: true, force: true });
    mockHomedir.mockClear();
  });

  it("should load workflows from both project and global directories", async () => {
    const workflows = await loadWorkflows(projectDir);
    expect(workflows).toHaveLength(3);
    expect(workflows.some((w) => w.id === "project-workflow")).toBe(true);
    expect(workflows.some((w) => w.id === "global-workflow")).toBe(true);
    expect(workflows.some((w) => w.id === "duplicate")).toBe(true);
  });

  it("should prioritize project workflows over global ones with the same name", async () => {
    const workflows = await loadWorkflows(projectDir);
    const duplicate = workflows.find((w) => w.id === "duplicate");
    expect(duplicate).toBeDefined();
    expect(duplicate?.content).toBe("Project duplicate content");
  });

  it("should only load project workflows when includeGlobalWorkflows is false", async () => {
    const workflows = await loadWorkflows(projectDir, false);
    expect(workflows).toHaveLength(2);
    expect(workflows.some((w) => w.id === "project-workflow")).toBe(true);
    expect(workflows.some((w) => w.id === "duplicate")).toBe(true);
    expect(workflows.some((w) => w.id === "global-workflow")).toBe(false);
  });

  it("should correctly parse frontmatter", async () => {
    const workflows = await loadWorkflows(projectDir);
    const projectWorkflow = workflows.find((w) => w.id === "project-workflow");
    expect(projectWorkflow).toBeDefined();
    expect(projectWorkflow?.frontmatter.model).toBe("project-model");
  });
});

