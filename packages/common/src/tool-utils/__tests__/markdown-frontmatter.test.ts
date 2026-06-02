import { describe, expect, it } from "vitest";
import { parseMarkdownWithFrontmatter } from "../markdown-frontmatter";

describe("parseMarkdownWithFrontmatter", () => {
  it("derives default name from basename for flat files", async () => {
    const result = await parseMarkdownWithFrontmatter("foo.md", () =>
      Promise.resolve("---\nname: foo\n---\n\nbody"),
    );
    expect(result.ok).toBe(true);
    expect(result.defaultName).toBe("foo");
  });

  it("derives default name from parent directory when filename matches folderFileName", async () => {
    const result = await parseMarkdownWithFrontmatter(
      "agents/my-agent/AGENT.md",
      () => Promise.resolve("---\nname: my-agent\n---\n\nbody"),
      { folderFileName: "agent.md" },
    );
    expect(result.ok).toBe(true);
    expect(result.defaultName).toBe("my-agent");
  });

  it("returns readError when the file cannot be read", async () => {
    const result = await parseMarkdownWithFrontmatter("foo.md", () =>
      Promise.reject(new Error("nope")),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("readError");
    expect(result.message).toBe("nope");
  });

  it("returns parseError with body when frontmatter is empty", async () => {
    const result = await parseMarkdownWithFrontmatter("foo.md", () =>
      Promise.resolve("---\n---\n\nhello body"),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("parseError");
    expect(result.body).toContain("hello body");
  });

  it("strips YAML node from body", async () => {
    const result = await parseMarkdownWithFrontmatter("foo.md", () =>
      Promise.resolve("---\nname: foo\n---\n\nhello body"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.body).not.toContain("---");
    expect(result.body).toContain("hello body");
  });

  it("returns parsed frontmatter and trimmed body on success", async () => {
    const result = await parseMarkdownWithFrontmatter("foo.md", () =>
      Promise.resolve(
        "---\nname: foo\ndescription: bar\n---\n\n  body content  \n",
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.frontmatter).toEqual({ name: "foo", description: "bar" });
    expect(result.body).toBe("body content");
  });
});
