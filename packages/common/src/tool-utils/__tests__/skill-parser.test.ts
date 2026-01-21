import { describe, expect, it } from "vitest";
import type { ValidSkillFile } from "../../vscode-webui-bridge/types/skill";
import { parseSkillFile } from "../skill-parser";

describe("parseSkillFile", () => {
  it("should parse a valid skill file with YAML frontmatter", async () => {
    const content = `---
name: test-skill
description: A test skill
license: MIT
compatibility: Node.js >= 18
allowed-tools: readFile writeFile
metadata:
  author: test-author
  version: 1.0.0
---

You are a test skill for verification purposes.
Follow the instructions carefully.`;

    const result = await parseSkillFile("test-skill/skill.md", () =>
      Promise.resolve(content),
    );

    expect(result).toBeDefined();
    expect(result.name).toBe("test-skill");
    const validResult = result as ValidSkillFile;
    expect(validResult.description).toBe("A test skill");
    expect(validResult.license).toBe("MIT");
    expect(validResult.compatibility).toBe("Node.js >= 18");
    expect(validResult.allowedTools).toBe("readFile writeFile");
    expect(validResult.metadata).toEqual({
      author: "test-author",
      version: "1.0.0",
    });
    expect(validResult.instructions).toContain(
      "You are a test skill for verification purposes.",
    );
    expect(validResult.instructions).toContain(
      "Follow the instructions carefully.",
    );
  });

  it("should parse skill with minimal required fields", async () => {
    const content = `---
name: minimal-skill
description: A minimal skill with only required fields
---

This is a minimal skill with just the required fields.`;

    const result = await parseSkillFile("minimal-skill/skill.md", () =>
      Promise.resolve(content),
    );

    expect(result).toBeDefined();
    const validResult = result as ValidSkillFile;
    expect(validResult.name).toBe("minimal-skill");
    expect(validResult.description).toBe("A minimal skill with only required fields");
    expect(validResult.license).toBeUndefined();
    expect(validResult.compatibility).toBeUndefined();
    expect(validResult.allowedTools).toBeUndefined();
    expect(validResult.metadata).toBeUndefined();
    expect(validResult.instructions).toContain(
      "This is a minimal skill with just the required fields.",
    );
  });

  it("should return an error for invalid frontmatter", async () => {
    const content = `---
name: missing-description
license: MIT
---

Content without required skill data.`;

    const result = await parseSkillFile("invalid-skill/skill.md", () =>
      Promise.resolve(content),
    );

    expect(result).toBeDefined();
    expect(result.name).toBe("invalid-skill");
    expect(result).toHaveProperty("error", "validationError");
    expect(result).toHaveProperty("message");
  });

  it("should return an error when frontmatter is missing", async () => {
    const content = "Just plain markdown content without frontmatter.";

    const result = await parseSkillFile("no-frontmatter/skill.md", () =>
      Promise.resolve(content),
    );

    expect(result).toBeDefined();
    expect(result.name).toBe("no-frontmatter");
    expect(result).toHaveProperty("error", "parseError");
    expect(result).toHaveProperty("message", "No skill definition found in the frontmatter of the file.");
  });

  it("should return an error for empty frontmatter", async () => {
    const content = `---
---

Content with empty frontmatter.`;

    const result = await parseSkillFile("empty-frontmatter/skill.md", () =>
      Promise.resolve(content),
    );

    expect(result).toBeDefined();
    expect(result.name).toBe("empty-frontmatter");
    expect(result).toHaveProperty("error", "parseError");
    expect(result).toHaveProperty("message", "No skill definition found in the frontmatter of the file.");
  });

  it("should handle file read errors", async () => {
    const result = await parseSkillFile("nonexistent/skill.md", () =>
      Promise.reject(new Error("File not found")),
    );

    expect(result).toBeDefined();
    expect(result.name).toBe("nonexistent");
    expect(result).toHaveProperty("error", "readError");
    expect(result).toHaveProperty("message", "File not found");
  });

  it("should parse skill with metadata as object", async () => {
    const content = `---
name: metadata-skill
description: Skill with complex metadata
metadata:
  category: utility
  version: "2.1.0"
  tags: "helper,automation"
---

Skill with rich metadata information.`;

    const result = await parseSkillFile("metadata-skill/skill.md", () =>
      Promise.resolve(content),
    );

    expect(result).toBeDefined();
    const validResult = result as ValidSkillFile;
    expect(validResult.metadata).toEqual({
      category: "utility",
      version: "2.1.0",
      tags: "helper,automation",
    });
  });
});