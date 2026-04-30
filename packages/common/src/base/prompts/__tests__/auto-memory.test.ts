import { describe, expect, it } from "vitest";
import {
  buildAutoMemoryPrompt,
  formatAutoMemoryManifest,
  truncateAutoMemoryIndex,
} from "../auto-memory";

describe("long-term memory prompt helpers", () => {
  it("does not render when memory is disabled", () => {
    expect(buildAutoMemoryPrompt(undefined)).toBe("");
  });

  it("renders memory location and truncated index content", () => {
    const prompt = buildAutoMemoryPrompt({
      enabled: true,
      repoKey: "repo-key",
      memoryDir: "/home/user/.pochi/projects/repo-key/memory",
      indexPath: "/home/user/.pochi/projects/repo-key/memory/MEMORY.md",
      indexContent: "- [project] conventions.md",
      indexTruncated: false,
      manifest: [],
    });

    expect(prompt).toContain("LONG-TERM MEMORY");
    expect(prompt).toContain("/home/user/.pochi/projects/repo-key/memory");
    expect(prompt).toContain("- [project] conventions.md");
  });

  it("caps index content by line count", () => {
    const content = Array.from({ length: 250 }, (_, i) => `line ${i}`).join(
      "\n",
    );

    const result = truncateAutoMemoryIndex(content);

    expect(result.truncated).toBe(true);
    expect(result.content).toContain("Long-term memory index truncated");
    expect(result.content).not.toContain("line 249");
  });

  it("formats topic manifest entries", () => {
    expect(
      formatAutoMemoryManifest([
        {
          filename: "feedback.md",
          name: "Review feedback",
          description: "Prefer compact plans.",
          type: "feedback",
        },
      ]),
    ).toBe("- [feedback] feedback.md (Review feedback): Prefer compact plans.");
  });
});
