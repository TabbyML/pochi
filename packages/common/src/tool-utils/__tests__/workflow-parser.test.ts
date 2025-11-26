import { describe, expect, it } from "vitest";
import { parseWorkflow } from "../workflow-parser";

describe("parseWorkflow", () => {
  it("should parse a valid workflow file with frontmatter", async () => {
    const content = `---\nmodel: gpt-4\n---\nThis is the system prompt for the workflow.\n`;
    const result = await parseWorkflow(content);
    expect(result).toEqual({
      frontmatter: { model: "gpt-4" },
      content: "This is the system prompt for the workflow.\n",
    });
  });

  it("should handle missing model field in frontmatter", async () => {
    const content = `---\nname: my-workflow\n---\nMinimal prompt.\n`;
    const result = await parseWorkflow(content);
    expect(result).toEqual({
      frontmatter: { model: undefined },
      content: "Minimal prompt.\n",
    });
  });

  it("should return undefined model when no frontmatter is present", async () => {
    const content = "This is a system prompt without any frontmatter.";
    const result = await parseWorkflow(content);
    expect(result).toEqual({
      frontmatter: { model: undefined },
      content: "This is a system prompt without any frontmatter.\n",
    });
  });

  it("should handle empty frontmatter", async () => {
    const content = `---\n---\nSystem prompt with empty frontmatter.\n`;
    const result = await parseWorkflow(content);
    expect(result).toEqual({
      frontmatter: { model: undefined },
      content: "System prompt with empty frontmatter.\n",
    });
  });

  it("should return an error for invalid YAML in frontmatter", async () => {
    const content = `---\nmodel: an unclosed: { string\n---\nPrompt.\n`;
    const result = await parseWorkflow(content);
    expect(result.error).toBe("parseError");
    expect(result.message).toBeDefined();
    expect(result.frontmatter).toEqual({ model: undefined });
    expect(result.content).toBe(content);
  });

  it("should return an error for invalid frontmatter schema", async () => {
    const content = `---\nmodel: 12345\n---\nPrompt.\n`;
    const result = await parseWorkflow(content);
    expect(result.error).toBe("validationError");
    expect(result.message).toBeDefined();
    expect(result.frontmatter).toEqual({ model: undefined });
    expect(result.content).toBe("Prompt.\n");
  });

  it("should handle null or empty content", async () => {
    const nullResult = await parseWorkflow(null);
    expect(nullResult).toEqual({
      frontmatter: { model: undefined },
      content: "",
    });

    const emptyResult = await parseWorkflow("");
    expect(emptyResult).toEqual({
      frontmatter: { model: undefined },
      content: "",
    });
  });
});
