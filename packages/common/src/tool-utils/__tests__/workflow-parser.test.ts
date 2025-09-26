import { describe, expect, it } from "vitest";
import { parseWorkflowFrontmatter } from "../workflow-parser";

describe("parseWorkflowFrontmatter", () => {
  it("should parse a valid workflow file with frontmatter", async () => {
    const content = `---
model: gpt-4
---
This is the system prompt for the workflow.
`;
    const result = await parseWorkflowFrontmatter(content);
    expect(result).toEqual({
      model: "gpt-4",
    });
  });

  it("should handle missing model field in frontmatter", async () => {
    const content = `---
name: my-workflow
---
Minimal prompt.
`;
    const result = await parseWorkflowFrontmatter(content);
    expect(result).toEqual({
      model: undefined,
    });
  });

  it("should return undefined model when no frontmatter is present", async () => {
    const content = "This is a system prompt without any frontmatter.";
    const result = await parseWorkflowFrontmatter(content);
    expect(result).toEqual({
      model: undefined,
    });
  });

  it("should handle empty frontmatter", async () => {
    const content = `---
---
System prompt with empty frontmatter.
`;
    const result = await parseWorkflowFrontmatter(content);
    expect(result).toEqual({
      model: undefined,
    });
  });

  it("should return an error for invalid YAML in frontmatter", async () => {
    const content = `---
model: an unclosed: { string
---
Prompt.
`;
    const result = await parseWorkflowFrontmatter(content);
    expect(result.error).toBe("parseError");
    expect(result.message).toBeDefined();
  });

  it("should return an error for invalid frontmatter schema", async () => {
    const content = `---
model: 12345
---
Prompt.
`;
    const result = (await parseWorkflowFrontmatter(content)) as {
      model: undefined;
      error: string;
      message: string;
    };
    expect(result.model).toBeUndefined();
    expect(result.error).toBe("validationError");
    expect(result.message).toBeDefined();
  });

  it("should handle null or empty content", async () => {
    const nullResult = await parseWorkflowFrontmatter(null);
    expect(nullResult).toEqual({
      model: undefined,
    });

    const emptyResult = await parseWorkflowFrontmatter("");
    expect(emptyResult).toEqual({
      model: undefined,
    });
  });
});
