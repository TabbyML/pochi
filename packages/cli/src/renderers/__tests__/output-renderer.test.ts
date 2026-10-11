import { homedir } from "node:os";
import path from "node:path";
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
  const pochiHomePath = (...parts: string[]) =>
    path.join(homedir(), ".pochi", ...parts);

  it("renders built-in skill readFile output with the display path", () => {
    const text = renderText({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "/var/folders/tmp/pochi-builtin-abc123def4567890/skills/widget-guidelines/references/chart.md",
      },
    } as ToolUIPart<UITools>);

    expect(text).toContain(
      "Reading pochi://skills/widget-guidelines/references/chart.md",
    );
  });

  it("renders built-in agent readFile output with the display path", () => {
    const text = renderText({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "/var/folders/tmp/pochi-builtin-abc123def4567890/agents/guide/references/config-schema.md",
      },
    } as ToolUIPart<UITools>);

    expect(text).toContain(
      "Reading pochi://agents/guide/references/config-schema.md",
    );
  });

  it("renders built-in virtual URI readFile output with the display path", () => {
    const text = renderText({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "pochi://skills/widget-guidelines/references/interactive.md",
      },
    } as ToolUIPart<UITools>);

    expect(text).toContain(
      "Reading pochi://skills/widget-guidelines/references/interactive.md",
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

    expect(text).toContain("Listing files in pochi://skills/widget-guidelines");
  });

  it("renders the search limit independently from the match count", () => {
    const executingText = renderText({
      type: "tool-searchFiles",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: ".",
        regex: "store",
        limit: 20,
      },
    } as ToolUIPart<UITools>);
    const completedText = renderText({
      type: "tool-searchFiles",
      toolCallId: "call-1",
      state: "output-available",
      input: {
        path: ".",
        regex: "store",
        limit: 20,
      },
      output: {
        matches: [{ file: "store.ts", line: 1, context: "const store = {};" }],
        isTruncated: false,
      },
    } as ToolUIPart<UITools>);

    expect(executingText).toContain("Searching for store in . (limit: 20)");
    expect(completedText).toContain(
      "Searching for store in . (limit: 20), 1 matched",
    );
  });

  it("preserves completed search output when no limit is provided", () => {
    const text = renderText({
      type: "tool-searchFiles",
      toolCallId: "call-1",
      state: "output-available",
      input: {
        path: ".",
        regex: "store",
      },
      output: {
        matches: [{ file: "store.ts", line: 1, context: "const store = {};" }],
        isTruncated: false,
      },
    } as ToolUIPart<UITools>);

    expect(text).toBe("🔍 Searching for store in .");
  });

  it("renders project memory paths in file operation output", () => {
    const memoryPath = pochiHomePath(
      "projects",
      "pochi-c212a47e71",
      "memory",
      "project.md",
    );

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

      expect(text).toContain("pochi://$/memory/project.md");
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

  it("renders project memory virtual URIs with the project memory display path", () => {
    const text = renderText({
      type: "tool-writeToFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "pochi://$/memory/llm-training.md",
      },
    } as ToolUIPart<UITools>);

    expect(text).toContain("pochi://$/memory/llm-training.md");
  });

  it("renders persisted task tool result paths with the task display path", () => {
    const text = renderText({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: pochiHomePath(
          "tasks",
          "ac7cadc8-4685-4508-9c75-2cf273b54deb",
          "tool-results",
          "executeCommand-HsqmmmQnwJuB1Jtz-output.log",
        ),
      },
    } as ToolUIPart<UITools>);

    expect(text).toContain(
      "pochi://~/tool-results/executeCommand-HsqmmmQnwJuB1Jtz-output.log",
    );
  });

  it("renders background job output reads with the inferred job id", () => {
    const text = renderText({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "pochi://~/background-jobs/bgjob-cmd-abc-123.log",
      },
    } as ToolUIPart<UITools>);

    expect(text).toContain(
      "Reading background job output bgjob-cmd-abc-123",
    );
  });

  it("renders background executeCommand calls distinctly", () => {
    const text = renderText({
      type: "tool-executeCommand",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        command: "npm run dev",
        background: true,
      },
    } as ToolUIPart<UITools>);

    expect(text).toContain("Running in background npm run dev");
  });

  it("renders terminal output reads with the inferred terminal id", () => {
    const text = renderText({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: "/Users/alice/.pochi/terminals/term-abc-123.log",
      },
    } as ToolUIPart<UITools>);

    expect(text).toContain("Reading terminal output term-abc-123");
  });

  it("renders unmatched Pochi home paths with the global display prefix", () => {
    const text = renderText({
      type: "tool-readFile",
      toolCallId: "call-1",
      state: "input-available",
      input: {
        path: pochiHomePath(
          "tasks",
          "ac7cadc8-4685-4508-9c75-2cf273b54deb",
        ),
      },
    } as ToolUIPart<UITools>);

    expect(text).toContain(
      "Reading pochi://tasks/ac7cadc8-4685-4508-9c75-2cf273b54deb",
    );
  });
});
