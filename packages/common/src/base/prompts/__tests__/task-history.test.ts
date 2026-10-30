import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prompts } from "../index";
import { createSystemPrompt } from "../system";
import {
  TaskTranscriptFormat,
  buildTaskHistoryPrompt,
  renderTaskIndex,
} from "../task-history";

const taskHistory = {
  indexPath: "/home/user/.pochi/projects/repo-key/transcripts/INDEX.md",
  transcriptDir: "/home/user/.pochi/projects/repo-key/transcripts",
};

describe("renderTaskIndex", () => {
  let originalTz: string | undefined;

  beforeEach(() => {
    originalTz = process.env.TZ;
    process.env.TZ = "Asia/Shanghai";
  });

  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it("lists one line per task, most recently updated first, in local time", () => {
    const index = renderTaskIndex([
      {
        transcriptFilename: "old.md",
        title: "Old task",
        updatedAt: Date.UTC(2026, 9, 1, 1, 30),
      },
      {
        transcriptFilename: "new.md",
        title: "  Multi\nline   title | with pipe ",
        updatedAt: Date.UTC(2026, 9, 29, 8, 34),
      },
      {
        transcriptFilename: "legacy.md",
        updatedAt: Date.UTC(2026, 9, 15, 12, 0),
      },
    ]);

    const lines = index.split("\n");
    expect(lines[0]).toBe("# Task Index");
    expect(lines).toContain("updated | transcript | title");
    expect(lines.filter((line) => line.includes(".md |"))).toEqual([
      "2026-10-29 16:34 +08:00 | new.md | Multi line title | with pipe",
      "2026-10-15 20:00 +08:00 | legacy.md | (untitled)",
      "2026-10-01 09:30 +08:00 | old.md | Old task",
    ]);
  });

  it("renders a placeholder when there are no transcripts", () => {
    expect(renderTaskIndex([])).toContain("(No task transcripts yet.)");
  });
});

describe("task history prompt", () => {
  it("is omitted without a task history context", () => {
    expect(buildTaskHistoryPrompt(undefined)).toBe("");
    expect(createSystemPrompt("")).not.toContain("TASK HISTORY");
  });

  it("points at the index and limits when to consult it", () => {
    const prompt = buildTaskHistoryPrompt(taskHistory);
    expect(prompt).toContain(`Index file: ${taskHistory.indexPath}`);
    expect(prompt).toContain(
      `Transcripts directory: ${taskHistory.transcriptDir}`,
    );
    expect(prompt).toContain("Consult task history only when:");
    expect(prompt).toContain("Never read the whole index.");
    expect(prompt).toContain("filePattern `INDEX.md`");
    expect(prompt).toContain(TaskTranscriptFormat);
  });

  it("does not depend on long-term memory, which has its own toggle", () => {
    expect(
      buildTaskHistoryPrompt(taskHistory).toLowerCase(),
    ).not.toContain("memory");
  });

  it("follows long-term memory in the system prompt", () => {
    const prompt = createSystemPrompt(
      "",
      undefined,
      undefined,
      {
        enabled: true,
        repoKey: "repo-key",
        memoryDir: "/home/user/.pochi/projects/repo-key/memory",
        indexPath: "/home/user/.pochi/projects/repo-key/memory/MEMORY.md",
        indexContent: "",
        indexTruncated: false,
        manifest: [],
        transcriptDir: taskHistory.transcriptDir,
      },
      { taskHistory },
    );
    const memoryAt = prompt.indexOf("LONG-TERM MEMORY");
    const taskHistoryAt = prompt.indexOf("TASK HISTORY");
    expect(memoryAt).toBeGreaterThan(-1);
    expect(taskHistoryAt).toBeGreaterThan(memoryAt);
  });

  it("shares the transcript format with task references", () => {
    expect(
      prompts.taskReferences([{ title: "Task", path: "/t/task.md" }]),
    ).toContain(TaskTranscriptFormat);
  });
});
