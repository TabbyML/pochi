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

  it("should keep scoped tool syntax intact in string tools", async () => {
    const content = `---
name: scoped-tools-agent
description: Agent with scoped tool args in string format
tools: readFile, executeCommand(agent-browser), executeCommand(npm), searchFiles
---

Agent with scoped tools.`;

    const result = await parseAgentFile("scoped-tools-agent.md", () =>
      Promise.resolve(content),
    );

    const validResult = result as ValidCustomAgentFile;
    expect(validResult.tools).toEqual([
      "readFile",
      "executeCommand(agent-browser)",
      "executeCommand(npm)",
      "searchFiles",
    ]);
  });

  it("should parse multiple string tools with merged executeCommand entries", async () => {
    const content = `---
name: multi-string-tools-agent
description: Agent with many string tools
tools: readFile, writeToFile, executeCommand(agent-browser *), executeCommand(git status), listFiles
---

Agent with many tools in string form.`;

    const result = await parseAgentFile("multi-string-tools-agent.md", () =>
      Promise.resolve(content),
    );

    const validResult = result as ValidCustomAgentFile;
    expect(validResult.tools).toEqual([
      "readFile",
      "writeToFile",
      "executeCommand(agent-browser *)",
      "executeCommand(git status)",
      "listFiles",
    ]);
  });

  it("should parse merged executeCommand declarations in one tools string", async () => {
    const content = `---
name: execute-command-merged-agent
description: Agent with merged executeCommand entries
tools: executeCommand(agent-browser), executeCommand(npm), readFile
---

Agent with merged executeCommand declarations.`;

    const result = await parseAgentFile("execute-command-merged-agent.md", () =>
      Promise.resolve(content),
    );

    const validResult = result as ValidCustomAgentFile;
    expect(validResult.tools).toEqual([
      "executeCommand(agent-browser)",
      "executeCommand(npm)",
      "readFile",
    ]);
  });

  it("should parse repeated scoped tool declarations as separate entries", async () => {
    const content = `---
name: repeated-scoped-agent
description: Agent with repeated scoped tool declarations
tools: readFile(src/**), readFile(pochi://-/plan.md), writeToFile(src/**/*.md), writeToFile(pochi://-/notes.md), executeCommand(git status), executeCommand(npm run *), searchFiles
---

Agent with repeated scoped declarations.`;

    const result = await parseAgentFile("repeated-scoped-agent.md", () =>
      Promise.resolve(content),
    );

    const validResult = result as ValidCustomAgentFile;
    expect(validResult.tools).toEqual([
      "readFile(src/**)",
      "readFile(pochi://-/plan.md)",
      "writeToFile(src/**/*.md)",
      "writeToFile(pochi://-/notes.md)",
      "executeCommand(git status)",
      "executeCommand(npm run *)",
      "searchFiles",
    ]);
  });

  it("should parse quoted one-line tool strings split by top-level commas", async () => {
    const content = `---
name: quoted-one-line-agent
description: Agent with quoted one-line tools string
tools: "readFile(src/**), readFile(pochi://-/plan.md), executeCommand(git status), searchFiles"
---

Agent with quoted one-line tools string.`;

    const result = await parseAgentFile("quoted-one-line-agent.md", () =>
      Promise.resolve(content),
    );

    const validResult = result as ValidCustomAgentFile;
    expect(validResult.tools).toEqual([
      "readFile(src/**)",
      "readFile(pochi://-/plan.md)",
      "executeCommand(git status)",
      "searchFiles",
    ]);
  });

  it("should return an error for scoped tool declarations containing commas", async () => {
    const content = `---
name: scoped-comma-agent
description: Agent with invalid scoped tool declarations
tools: readFile(src/**, pochi://-/plan.md), executeCommand(git status, npm run *)
---

Agent with invalid scoped declarations.`;

    const result = await parseAgentFile("scoped-comma-agent.md", () =>
      Promise.resolve(content),
    );

    expect(result).toBeDefined();
    expect(result).toHaveProperty("error", "validationError");
    expect(result).toHaveProperty(
      "message",
      'Invalid tool declaration "readFile(src/**, pochi://-/plan.md)". Use one declaration per tool rule, for example: readFile(src/**), readFile(pochi://-/plan.md).',
    );
  });

  it("should parse multiple array tools and trim empty entries", async () => {
    const content = `---
name: multi-array-tools-agent
description: Agent with many array tools
tools:
  - readFile
  - " executeCommand(agent-browser *) "
  - " executeCommand(git status) "
  - ""
  - " searchFiles "
  - writeToFile
---

Agent with many tools in array form.`;

    const result = await parseAgentFile("multi-array-tools-agent.md", () =>
      Promise.resolve(content),
    );

    const validResult = result as ValidCustomAgentFile;
    expect(validResult.tools).toEqual([
      "readFile",
      "executeCommand(agent-browser *)",
      "executeCommand(git status)",
      "searchFiles",
      "writeToFile",
    ]);
  });

  it("should return an error for array tool entries containing commas in scoped declarations", async () => {
    const content = `---
name: invalid-array-tools-agent
description: Agent with invalid array tools
tools:
  - "readFile(src/**, pochi://-/plan.md)"
  - searchFiles
---

Agent with invalid array tools.`;

    const result = await parseAgentFile("invalid-array-tools-agent.md", () =>
      Promise.resolve(content),
    );

    expect(result).toBeDefined();
    expect(result).toHaveProperty("error", "validationError");
    expect(result).toHaveProperty(
      "message",
      'Invalid tool declaration "readFile(src/**, pochi://-/plan.md)". Use one declaration per tool rule, for example: readFile(src/**), readFile(pochi://-/plan.md).',
    );
  });

  it("should parse omitAgentsMd from frontmatter", async () => {
    const content = `---
name: no-rules-agent
description: Agent that opts out of workspace rules
omitAgentsMd: true
---

Agent content.`;

    const result = await parseAgentFile("no-rules-agent.md", () =>
      Promise.resolve(content),
    );

    const validResult = result as ValidCustomAgentFile;
    expect(validResult.omitAgentsMd).toBe(true);
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
