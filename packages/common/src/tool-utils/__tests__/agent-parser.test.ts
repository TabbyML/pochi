import { describe, expect, it } from "vitest";
import type { ValidCustomAgentFile } from "../../vscode-webui-bridge/types/custom-agent";
import { parseAgentFile } from "../agent-parser";

describe("parseAgentFile", () => {
  it("should parse a valid agent file with YAML frontmatter", async () => {
    const content = `---
name: test-agent
description: A test agent
tools: readFile, writeToFile
---

You are a test agent for verification purposes.`;

    const result = await parseAgentFile("test-agent.md", () =>
      Promise.resolve(content),
    );

    expect(result).toBeDefined();
    expect(result.name).toBe("test-agent");
    const validResult = result as ValidCustomAgentFile;
    expect(validResult.description).toBe("A test agent");
    expect(validResult.tools).toEqual(["readFile", "writeToFile"]);
    expect(validResult.systemPrompt).toContain(
      "You are a test agent for verification purposes.",
    );
  });

  it("should parse agent with tools as array", async () => {
    const content = `---
name: array-tools-agent
description: Agent with array tools
tools: 
  - readFile
  - writeToFile
  - executeCommand
---

Agent with array-style tools.`;

    const result = await parseAgentFile("array-tools-agent.md", () =>
      Promise.resolve(content),
    );

    expect(result).toBeDefined();
    const validResult = result as ValidCustomAgentFile;
    expect(validResult.tools).toEqual([
      "readFile",
      "writeToFile",
      "executeCommand",
    ]);
  });

  it("should return an error for invalid frontmatter", async () => {
    const content = `---
name: missing-description
---

Content without required agent data.`;

    const result = await parseAgentFile("invalid-agent.md", () =>
      Promise.resolve(content),
    );

    expect(result).toBeDefined();
    expect(result.name).toBe("invalid-agent");
    expect(result).toHaveProperty("error", "validationError");
  });

  it("should return an error when frontmatter is missing", async () => {
    const content = "Just plain markdown content without frontmatter.";

    const result = await parseAgentFile("no-frontmatter.md", () =>
      Promise.resolve(content),
    );

    expect(result).toBeDefined();
    expect(result.name).toBe("no-frontmatter");
    expect(result).toHaveProperty("error", "parseError");
  });

  it("should return an error for empty frontmatter", async () => {
    const content = `---
---

Content with empty frontmatter.`;

    const result = await parseAgentFile("empty-frontmatter.md", () =>
      Promise.resolve(content),
    );

    expect(result).toBeDefined();
    expect(result.name).toBe("empty-frontmatter");
    expect(result).toHaveProperty("error", "parseError");
  });
});
