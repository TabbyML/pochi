import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
  type AutoMemoryContext,
  buildAutoMemoryDreamDirective,
  buildAutoMemoryDynamicPrompt,
  buildAutoMemoryPrompt,
  buildAutoMemoryStaticPrompt,
  formatAutoMemoryManifest,
  injectAutoMemory,
  isAutoMemorySystemReminder,
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
    expect(buildAutoMemoryStaticPrompt(undefined)).toBe("");
    expect(buildAutoMemoryDynamicPrompt(undefined)).toBe("");
    expect(buildAutoMemoryPrompt(undefined)).toBe("");
  });

  it("static prompt carries rules and paths but never the live index", () => {
    const staticPrompt = buildAutoMemoryStaticPrompt(sampleContext);

    expect(staticPrompt).toContain("LONG-TERM MEMORY");
    expect(staticPrompt).toContain(
      "/home/user/.pochi/projects/repo-key/memory",
    );
    // Static prompt deliberately omits the live index content — it is
    // delivered separately so the system prompt prefix can stay cached
    // across sessions.
    expect(staticPrompt).not.toContain("- [project] conventions.md");
    expect(staticPrompt).toContain(
      "delivered separately as its own system reminder",
    );
  });

  it("dynamic prompt renders the live MEMORY.md index inline", () => {
    const dynamicPrompt = buildAutoMemoryDynamicPrompt(sampleContext);

    expect(dynamicPrompt).toContain("Long-term Memory Index (MEMORY.md)");
    expect(dynamicPrompt).toContain("- [project] conventions.md");
    expect(dynamicPrompt).toContain("snapshot of MEMORY.md was captured");
  });

  it("dynamic prompt falls back to a placeholder when the index is empty", () => {
    const dynamicPrompt = buildAutoMemoryDynamicPrompt({
      ...sampleContext,
      indexContent: "   ",
    });

    expect(dynamicPrompt).toContain("(MEMORY.md is currently empty.)");
  });

  it("buildAutoMemoryPrompt composes static + dynamic for back-compat", () => {
    const combined = buildAutoMemoryPrompt(sampleContext);

    expect(combined).toContain("LONG-TERM MEMORY");
    expect(combined).toContain("Long-term Memory Index (MEMORY.md)");
    expect(combined).toContain("- [project] conventions.md");
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

  const makeUserMessage = (text: string): UIMessage => ({
    id: "user-1",
    role: "user",
    parts: [{ type: "text", text }],
  });

  it("injectAutoMemory inserts a dedicated reminder before the user's text on the first turn", () => {
    const messages = [makeUserMessage("hello")];
    const result = injectAutoMemory(messages, sampleContext);

    expect(result).toBe(messages);
    const parts = result[0].parts;
    expect(parts).toHaveLength(2);

    const reminder = parts[0];
    const userPart = parts[1];
    expect(reminder.type).toBe("text");
    expect(userPart.type).toBe("text");
    if (reminder.type !== "text" || userPart.type !== "text") {
      throw new Error("expected text parts");
    }

    expect(reminder.text.startsWith("<system-reminder>")).toBe(true);
    expect(reminder.text.endsWith("</system-reminder>")).toBe(true);
    expect(isAutoMemorySystemReminder(reminder.text)).toBe(true);
    expect(reminder.text).toContain("Long-term Memory Index (MEMORY.md)");
    expect(reminder.text).toContain("- [project] conventions.md");
    expect(userPart.text).toBe("hello");
  });

  it("injectAutoMemory is a no-op without context or memory block", () => {
    const messages = [makeUserMessage("hello")];
    expect(injectAutoMemory(messages, undefined)).toBe(messages);
    expect(messages[0].parts).toHaveLength(1);
  });

  it("injectAutoMemory only fires on the first user turn", () => {
    const messages: UIMessage[] = [
      makeUserMessage("first"),
      { id: "asst-1", role: "assistant", parts: [{ type: "text", text: "ok" }] },
      makeUserMessage("second"),
    ];

    injectAutoMemory(messages, sampleContext);
    // No reminder appended on the latest user turn.
    expect(messages[2].parts).toHaveLength(1);
  });

  it("injectAutoMemory replaces a stale reminder rather than duplicating", () => {
    const messages = [makeUserMessage("hello")];
    injectAutoMemory(messages, sampleContext);
    injectAutoMemory(messages, {
      ...sampleContext,
      indexContent: "- [user] bio.md",
    });

    const reminders = messages[0].parts.filter(
      (p) => p.type === "text" && isAutoMemorySystemReminder(p.text),
    );
    expect(reminders).toHaveLength(1);
    if (reminders[0].type === "text") {
      expect(reminders[0].text).toContain("- [user] bio.md");
      expect(reminders[0].text).not.toContain("- [project] conventions.md");
    }
  });
});
