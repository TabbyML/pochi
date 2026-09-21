import { homedir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import type { UITools } from "@getpochi/livekit";
import type { ToolUIPart } from "ai";
import { describe, expect, it } from "vitest";
import { Chat } from "../../livekit/chat.node";
import { OutputRenderer, renderToolPart } from "../output-renderer";

function renderText(part: ToolUIPart<UITools>) {
  return renderToolPart(part).text.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
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

    expect(text).toContain("Reading background job output bgjob-cmd-abc-123");
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

  it("shows a promoted command as started in the background, with its job ID", () => {
    const rendered = renderToolPart({
      type: "tool-executeCommand",
      toolCallId: "promoted",
      state: "output-available",
      input: { command: "npm test", background: false },
      output: {
        output: "started",
        _meta: {
          backgroundJobId: "bgjob-cmd-test",
          outputFile: "/tmp/output.log",
        },
      },
    });
    expect(rendered.text).toContain("Started background command");
    expect(rendered.text).toContain("bgjob-cmd-test");
    expect(rendered.text).toContain("Output:");
    expect(rendered.stop).toBe("stopAndPersist");
  });

  it("does not announce task completion while background work is pending", () => {
    const part = {
      type: "tool-attemptCompletion",
      toolCallId: "done",
      state: "input-available",
      input: { result: "Waiting for tests" },
    } as const;
    expect(renderToolPart(part, false, true).text).toContain(
      "Background work pending",
    );
    expect(renderToolPart(part, false, true).text).not.toContain(
      "Task Completed",
    );
    expect(renderToolPart(part, false, false).text).toContain("Task Completed");
  });

  it("renders a background agent launch instead of skipping newTask", () => {
    const stream = new PassThrough();
    let output = "";
    stream.on("data", (chunk) => {
      output += chunk;
    });
    const state = new Chat({ id: "test" }).getState();
    const renderer = new OutputRenderer(stream, state);
    try {
      state.messages = [
        {
          id: "launch",
          role: "assistant",
          parts: [
            {
              type: "tool-newTask",
              toolCallId: "launch-agent",
              state: "output-available",
              input: { description: "Inspect files", prompt: "Inspect files" },
              output: {
                result: "started",
                backgroundJobId: "bgjob-task-worker",
              },
            },
          ],
        },
      ];
    } finally {
      renderer.shutdown();
    }
    expect(output).toContain("Started background agent");
    expect(output).toContain("Inspect files");
    expect(output).toContain("bgjob-task-worker");
  });

  it.each(["completed", "failed", "stopped"] as const)(
    "renders %s notifications once without an empty user block",
    (status) => {
      const stream = new PassThrough();
      let output = "";
      stream.on("data", (chunk) => {
        output += chunk;
      });
      const state = new Chat({ id: "test" }).getState();
      const renderer = new OutputRenderer(stream, state);
      const part = {
        type: "data-background-job-notification",
        data: {
          kind: "command",
          notificationId: "notice",
          backgroundJobId: "bgjob-cmd-worker",
          status,
          summary: `Background command ${status}`,
          outputFile: "/tmp/test.log",
          finishedAt: 1,
        },
      } as const;
      try {
        state.messages = [{ id: "notice", role: "user", parts: [part] }];
        state.messages = [
          { id: "notice", role: "user", parts: [part] },
          { id: "duplicate", role: "user", parts: [part] },
        ];
      } finally {
        renderer.shutdown();
      }
      expect(output.match(/Background jobs/g)).toHaveLength(1);
      expect(output).not.toContain("You");
      expect(output.match(/bgjob-cmd-worker/g)).toHaveLength(1);
      expect(output).toContain(`Background command ${status}`);
    },
  );

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
        path: pochiHomePath("tasks", "ac7cadc8-4685-4508-9c75-2cf273b54deb"),
      },
    } as ToolUIPart<UITools>);

    expect(text).toContain(
      "Reading pochi://tasks/ac7cadc8-4685-4508-9c75-2cf273b54deb",
    );
  });
});
