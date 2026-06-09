import type { UITools } from "@getpochi/livekit";
import type { ToolUIPart } from "ai";
import { describe, expect, it } from "vitest";
import { renderToolPart } from "../output-renderer";

function renderText(part: ToolUIPart<UITools>) {
  return renderToolPart(part).text.replace(
    /\u001B\[[0-?]*[ -/]*[@-~]/g,
    "",
  );
}

describe("renderToolPart", () => {
  it("renders built-in skill readFile output with the skill name and relative file path", () => {
    const text = renderText({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "/var/folders/tmp/pochi-builtin-abc123def4567890/skills/widget-guidelines/references/chart.md",
      },
    } as ToolUIPart<UITools>);

    expect(text).toContain(
      "Reading built-in skill widget-guidelines: references/chart.md",
    );
  });

  it("renders built-in agent readFile output with the agent name and relative file path", () => {
    const text = renderText({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "/var/folders/tmp/pochi-builtin-abc123def4567890/agents/guide/references/config-schema.md",
      },
    } as ToolUIPart<UITools>);

    expect(text).toContain(
      "Reading built-in agent guide: references/config-schema.md",
    );
  });

  it("renders built-in asset directories with the asset kind and name", () => {
    const text = renderText({
      type: "tool-listFiles",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "/var/folders/tmp/pochi-builtin-abc123def4567890/skills/widget-guidelines",
      },
    } as ToolUIPart<UITools>);

    expect(text).toContain("Listing files in skills/widget-guidelines");
  });

  it("renders project memory paths in file operation output", () => {
    const memoryPath =
      "/Users/jueliang/.pochi/projects/pochi-c212a47e71/memory/project.md";

    for (const type of [
      "tool-readFile",
      "tool-writeToFile",
      "tool-applyDiff",
    ] as const) {
      const text = renderText({
        type,
        toolCallId: "call-1",
        state: "input-available",
        input: {
          path: memoryPath,
        },
      } as ToolUIPart<UITools>);

      expect(text).toContain("projectMemory/project.md");
    }
  });

  it("renders task memory virtual file URIs unchanged", () => {
    const text = renderText({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "pochi://-/memory.md",
      },
    } as ToolUIPart<UITools>);

    expect(text).toContain("pochi://-/memory.md");
  });
});
