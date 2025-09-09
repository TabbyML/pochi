import { describe, expect, it } from "vitest";
import { parseAgentFile } from "../agent-parser";

describe("parseAgentFile", () => {
  it("should parse a valid agent file with YAML frontmatter", async () => {
    const content = `---
name: test-agent
description: A test agent
tools: readFile, writeToFile
---

You are a test agent for verification purposes.`;

    const result = await parseAgentFile(content);
    
    expect(result).toBeDefined();
    expect(result?.name).toBe("test-agent");
    expect(result?.description).toBe("A test agent");
    expect(result?.tools).toEqual(["readFile", "writeToFile"]);
    expect(result?.systemPrompt).toContain("You are a test agent for verification purposes.");
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

    const result = await parseAgentFile(content);
    
    expect(result).toBeDefined();
    expect(result?.tools).toEqual(["readFile", "writeToFile", "executeCommand"]);
  });

  it("should return undefined for invalid frontmatter", async () => {
    const content = `---
name: missing-description
---

Content without required agent data.`;

    const result = await parseAgentFile(content);
    
    expect(result).toBeUndefined();
  });

  it("should return undefined when frontmatter is missing", async () => {
    const content = "Just plain markdown content without frontmatter.";

    const result = await parseAgentFile(content);
    
    expect(result).toBeUndefined();
  });

  it("should handle empty frontmatter", async () => {
    const content = `---
---

Content with empty frontmatter.`;

    const result = await parseAgentFile(content);
    
    expect(result).toBeUndefined();
  });
});
