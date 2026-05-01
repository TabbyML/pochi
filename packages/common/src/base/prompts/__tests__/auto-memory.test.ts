import { describe, expect, it } from "vitest";
import {
  type AutoMemoryContext,
  buildAutoMemoryDreamDirective,
  buildAutoMemoryPrompt,
  formatAutoMemoryManifest,
  truncateAutoMemoryIndex,
} from "../auto-memory";

const sampleContext: AutoMemoryContext = {
  enabled: true,
  repoKey: "repo-key",
  memoryDir: "/home/user/.pochi/projects/repo-key/memory",
  indexPath: "/home/user/.pochi/projects/repo-key/memory/MEMORY.md",
  indexContent: "- [project] conventions.md",
  indexTruncated: false,
  manifest: [],
  transcriptDir: "/home/user/.pochi/projects/repo-key/transcripts",
};

describe("long-term memory prompt helpers", () => {
  it("does not render when memory is disabled", () => {
    expect(buildAutoMemoryPrompt(undefined)).toBe("");
  });

  it("renders memory location and truncated index content", () => {
    const prompt = buildAutoMemoryPrompt(sampleContext);

    expect(prompt).toContain("LONG-TERM MEMORY");
    expect(prompt).toContain("/home/user/.pochi/projects/repo-key/memory");
    expect(prompt).toContain("- [project] conventions.md");
  });

  it("dream directive references transcripts dir and lists session files only", () => {
    const directive = buildAutoMemoryDreamDirective({
      context: sampleContext,
      sessions: [
        {
          taskId: "task-a",
          updatedAt: 1_700_000_000_000,
          cwd: "/repo/a",
          transcriptFilename: "task-a.md",
        },
        {
          taskId: "task-b",
          updatedAt: 1_700_000_500_000,
          cwd: null,
          transcriptFilename: "task-b.md",
        },
      ],
    });

    expect(directive).toContain(
      "Transcripts directory: /home/user/.pochi/projects/repo-key/transcripts",
    );
    expect(directive).toContain("- task-a.md (taskId=task-a");
    expect(directive).toContain("- task-b.md (taskId=task-b");
    // Crucial property: directive should not embed transcript bodies.
    expect(directive).not.toContain("### 1.");
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
