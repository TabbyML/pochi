import { describe, it, expect } from "vitest";
import { parseWorkflowFrontmatter } from "../workflow-parser";

describe("parseWorkflowFrontmatter", () => {
  it("should parse frontmatter from user example", () => {
    const content = `--- 
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git commit:*)
model: qwen/qwen3-coder
---
## Context
- Current git status: !\`git status\`
- Current git diff (staged and unstaged changes): !\`git diff HEAD\`
- Current branch: !\`git branch --show-current\`
- Recent commits: !\`git log --oneline -10\`
## Your task
Based on the above changes, create a single git commit.
`;
    const { model, allowedTools } = parseWorkflowFrontmatter(content);
    expect(model).toEqual("qwen/qwen3-coder");
    expect(allowedTools).toEqual(
      "Bash(git add:*), Bash(git status:*), Bash(git commit:*)",
    );
  });

  it("should parse allowed-tools as a comma-separated string", () => {
    const content = `
---
allowed-tools: Bash(git status), Bash(git diff)
---
Hello
`;
    const { allowedTools } = parseWorkflowFrontmatter(content);
    expect(allowedTools).toEqual("Bash(git status), Bash(git diff)");
  });

  it("should fail to parse allowed-tools as a YAML array", () => {
    const content = `
---
allowed-tools:
  - Bash(git status)
  - Bash(git diff)
---
Hello
`;
    const { allowedTools, error } = parseWorkflowFrontmatter(content);
    expect(allowedTools).toBeUndefined();
    expect(error).toBe("validationError");
  });

  it("should parse allowed-tools with glob patterns", () => {
    const content = `
---
allowed-tools: Bash(git add *), Bash(git commit -m *)
---
Hello
`;
    const { allowedTools } = parseWorkflowFrontmatter(content);
    expect(allowedTools).toEqual("Bash(git add *), Bash(git commit -m *)");
  });

  it("should return undefined if allowed-tools is not present", () => {
    const content = `
---
model: gpt-4
---
Hello
`;
    const { allowedTools } = parseWorkflowFrontmatter(content);
    expect(allowedTools).toBeUndefined();
  });

  it("should return undefined for null or empty content", () => {
    expect(parseWorkflowFrontmatter(null).allowedTools).toBeUndefined();
    expect(parseWorkflowFrontmatter("").allowedTools).toBeUndefined();
  });

  it("should handle malformed frontmatter gracefully", () => {
    const content = `
---
allowed-tools: [Bash(git status)
---
Hello
`;
    const { allowedTools, error } = parseWorkflowFrontmatter(content);
    expect(allowedTools).toBeUndefined();
    expect(error).toBe("parseError");
  });

  it("should handle validation errors for incorrect types", () => {
    const content = `
---
allowed-tools: { tool: "Bash" }
---
Hello
`;
    const { allowedTools, error } = parseWorkflowFrontmatter(content);
    expect(allowedTools).toBeUndefined();
    expect(error).toBe("validationError");
  });
});

