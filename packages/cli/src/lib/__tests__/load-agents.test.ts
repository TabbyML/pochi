import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { compileToolPolicies, validateToolPolicy } from "@getpochi/tools";
import { describe, expect, it } from "vitest";
import { loadAgents, loadBuiltInAgents } from "../load-agents";

describe("Load Agents", () => {
  it("should load project agents with relative paths alongside built-in agents", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "pochi-load-agents-"),
    );

    try {
      const projectAgentsDir = path.join(projectRoot, ".pochi", "agents");
      await fs.mkdir(projectAgentsDir, { recursive: true });
      await fs.writeFile(
        path.join(projectAgentsDir, "project-agent.md"),
        `---
name: project-agent
description: Project test agent
tools:
  - readFile(src/**)
  - readFile(pochi://-/plan.md)
  - writeToFile
  - executeCommand(git status)
---

Project agent instructions.`,
      );

      const builtInAgents = await loadBuiltInAgents();
      const agents = await loadAgents(projectRoot, false);

      expect(agents).toEqual(
        expect.arrayContaining([
          ...builtInAgents,
          expect.objectContaining({
            name: "project-agent",
            description: "Project test agent",
            filePath: ".pochi/agents/project-agent.md",
            tools: [
              "readFile(src/**)",
              "readFile(pochi://-/plan.md)",
              "writeToFile",
              "executeCommand(git status)",
            ],
          }),
        ]),
      );
    } finally {
      await fs.rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("should load project agents when tools are declared as one comma-delimited string", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "pochi-load-agents-inline-"),
    );

    try {
      const projectAgentsDir = path.join(projectRoot, ".pochi", "agents");
      await fs.mkdir(projectAgentsDir, { recursive: true });
      await fs.writeFile(
        path.join(projectAgentsDir, "project-agent-inline.md"),
        `---
name: project-agent-inline
description: Project test agent with inline tools
tools: "readFile(src/**), readFile(pochi://-/plan.md), writeToFile, executeCommand(git status)"
---

Project agent instructions.`,
      );

      const builtInAgents = await loadBuiltInAgents();
      const agents = await loadAgents(projectRoot, false);

      expect(agents).toEqual(
        expect.arrayContaining([
          ...builtInAgents,
          expect.objectContaining({
            name: "project-agent-inline",
            description: "Project test agent with inline tools",
            filePath: ".pochi/agents/project-agent-inline.md",
            tools: [
              "readFile(src/**)",
              "readFile(pochi://-/plan.md)",
              "writeToFile",
              "executeCommand(git status)",
            ],
          }),
        ]),
      );
    } finally {
      await fs.rm(projectRoot, { recursive: true, force: true });
    }
  });

  it("should return built-in agents for non-existent directories", async () => {
    const builtInAgents = await loadBuiltInAgents();
    const agents = await loadAgents("/non/existent/path", false);
    expect(agents).toEqual(builtInAgents);
  });

  it("should keep browser agent command restrictions active", async () => {
    const browserAgent = (await loadBuiltInAgents()).find(
      (agent) => agent.name === "browser",
    );
    expect(browserAgent).toBeDefined();

    const policies = compileToolPolicies(browserAgent?.tools);
    expect(policies?.executeCommand).toBeDefined();

    expect(() =>
      validateToolPolicy(
        "executeCommand",
        { command: "rm -rf /tmp/example" },
        policies,
        { cwd: process.cwd() },
      ),
    ).toThrow("Command is not allowed by the configured command rules.");

    expect(() =>
      validateToolPolicy(
        "executeCommand",
        { command: "agent-browser open https://example.com" },
        policies,
        { cwd: process.cwd() },
      ),
    ).not.toThrow();
  });
});
