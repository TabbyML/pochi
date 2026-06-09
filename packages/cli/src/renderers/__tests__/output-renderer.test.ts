import type { UITools } from "@getpochi/livekit";
import type { ToolUIPart } from "ai";
import { describe, expect, it } from "vitest";
import { renderToolPart } from "../output-renderer";

describe("renderToolPart", () => {
  it("shows built-in skill files with the skill name and relative file path", () => {
    const rendered = renderToolPart({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "/var/folders/tmp/pochi-builtin-abc123def4567890/skills/widget-guidelines/references/chart.md",
      },
    } as ToolUIPart<UITools>);

    expect(rendered.text).toContain(
      "Reading built-in skill widget-guidelines: references/chart.md",
    );
    expect(rendered.text).not.toContain("(file ");
    expect(rendered.text).not.toContain("skill reference");
    expect(rendered.text).not.toContain("/var/folders/tmp/pochi-builtin");
    expect(rendered.text).not.toContain("$skills/");
  });

  it("shows built-in agent files with the agent name and relative file path", () => {
    const rendered = renderToolPart({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "/var/folders/tmp/pochi-builtin-abc123def4567890/agents/guide/references/config-schema.md",
      },
    } as ToolUIPart<UITools>);

    expect(rendered.text).toContain(
      "Reading built-in agent guide: references/config-schema.md",
    );
    expect(rendered.text).not.toContain("(file ");
    expect(rendered.text).not.toContain("agent reference");
    expect(rendered.text).not.toContain("/var/folders/tmp/pochi-builtin");
    expect(rendered.text).not.toContain("$agents/");
  });

  it("does not require built-in readFile paths to live under references", () => {
    const rendered = renderToolPart({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "/var/folders/tmp/pochi-builtin-abc123def4567890/skills/widget-guidelines/SKILL.md",
      },
    } as ToolUIPart<UITools>);

    expect(rendered.text).toContain(
      "Reading built-in skill widget-guidelines: SKILL.md",
    );
    expect(rendered.text).not.toContain("(file ");
    expect(rendered.text).not.toContain("skill reference");
  });

  it("shows built-in asset directories without dollar-prefixed aliases", () => {
    const rendered = renderToolPart({
      type: "tool-listFiles",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "/var/folders/tmp/pochi-builtin-abc123def4567890/skills/widget-guidelines",
      },
    } as ToolUIPart<UITools>);

    expect(rendered.text).toContain("skills/widget-guidelines");
    expect(rendered.text).not.toContain("$skills/");
  });

  it("keeps normal readFile paths unchanged", () => {
    const rendered = renderToolPart({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "packages/vscode-webui/src/main.tsx",
      },
    } as ToolUIPart<UITools>);

    expect(rendered.text).toContain(
      "Reading packages/vscode-webui/src/main.tsx",
    );
  });

  it("shortens project memory paths in file operation output", () => {
    const memoryPath =
      "/Users/jueliang/.pochi/projects/pochi-c212a47e71/memory/project.md";

    for (const type of [
      "tool-readFile",
      "tool-writeToFile",
      "tool-applyDiff",
    ] as const) {
      const rendered = renderToolPart({
        type,
        toolCallId: "call-1",
        state: "input-available",
        input: {
          path: memoryPath,
        },
      } as ToolUIPart<UITools>);

      expect(rendered.text).toContain("projectMemory/project.md");
      expect(rendered.text).not.toContain("/.pochi/projects/");
    }
  });

  it("keeps task memory virtual file URIs unchanged", () => {
    const rendered = renderToolPart({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "pochi://-/memory.md",
      },
    } as ToolUIPart<UITools>);

    expect(rendered.text).toContain("pochi://-/memory.md");
  });

  it("shortens project memory paths in listing and search output", () => {
    const memoryDir =
      "/Users/jueliang/.pochi/projects/pochi-c212a47e71/memory";

    const listRendered = renderToolPart({
      type: "tool-listFiles",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: memoryDir,
      },
    } as ToolUIPart<UITools>);
    expect(listRendered.text).toContain("projectMemory");
    expect(listRendered.text).not.toContain("/.pochi/projects/");

    const globRendered = renderToolPart({
      type: "tool-globFiles",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: memoryDir,
        globPattern: "*.md",
      },
    } as ToolUIPart<UITools>);
    expect(globRendered.text).toContain("projectMemory");
    expect(globRendered.text).not.toContain("/.pochi/projects/");

    const searchRendered = renderToolPart({
      type: "tool-searchFiles",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: memoryDir,
        regex: "preference",
      },
    } as ToolUIPart<UITools>);
    expect(searchRendered.text).toContain("projectMemory");
    expect(searchRendered.text).not.toContain("/.pochi/projects/");
  });

  it("shortens project transcript paths in file and listing output", () => {
    const transcriptPath =
      "/Users/jueliang/.pochi/projects/pochi-c212a47e71/transcripts/0076cd6c-8fb7-4d8f-9890-4bef6171e7e1.md";
    const transcriptDir =
      "/Users/jueliang/.pochi/projects/pochi-c212a47e71/transcripts";

    const readRendered = renderToolPart({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: transcriptPath,
      },
    } as ToolUIPart<UITools>);
    expect(readRendered.text).toContain(
      "projectTranscripts/0076cd6c-8fb7-4d8f-9890-4bef6171e7e1.md",
    );
    expect(readRendered.text).not.toContain("/.pochi/projects/");

    const listRendered = renderToolPart({
      type: "tool-listFiles",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: transcriptDir,
      },
    } as ToolUIPart<UITools>);
    expect(listRendered.text).toContain("projectTranscripts");
    expect(listRendered.text).not.toContain("/.pochi/projects/");
  });
});
