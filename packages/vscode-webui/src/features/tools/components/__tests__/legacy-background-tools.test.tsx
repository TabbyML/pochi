// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReadBackgroundJobOutputTool } from "../read-background-job-output";
import { StartBackgroundJobTool } from "../start-background-job";
import { ToolCallLite } from "../tool-call-lite";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../status-icon", () => ({
  StatusIcon: () => <div data-testid="status-icon" />,
}));

vi.mock("../command-execution-panel", () => ({
  BackgroundJobPanel: ({
    backgroundJobId,
    command,
    outputFile,
  }: {
    backgroundJobId: string;
    command?: string;
    outputFile?: string;
  }) => (
    <div
      data-command={command}
      data-output-file={outputFile}
      data-testid="background-job-panel"
    >
      {backgroundJobId}
    </div>
  ),
  CommandPanelContainer: ({ title }: { title: string }) => <div>{title}</div>,
  CopyCommandButton: () => null,
}));

const commonProps = {
  isExecuting: false,
  isLoading: false,
  messages: [],
};

describe("legacy background tool renderers", () => {
  it("hides legacy calls in compact task lists", () => {
    const { container } = render(
      <ToolCallLite
        showStatusIcon={false}
        tools={[
          {
            type: "tool-startBackgroundJob",
            toolCallId: "compact-start-call",
            state: "input-available",
            input: { command: "npm run dev", cwd: "/workspace" },
          },
        ]}
      />,
    );

    expect(container.textContent).toBe("");
  });

  it("renders a completed startBackgroundJob call", () => {
    render(
      <StartBackgroundJobTool
        {...commonProps}
        tool={{
          type: "tool-startBackgroundJob",
          toolCallId: "start-call",
          state: "output-available",
          input: { command: "npm run dev" },
          output: {
            backgroundJobId: "legacy-job",
            outputFile: "/tmp/legacy-job.log",
          },
        }}
      />,
    );

    expect(screen.getByTestId("background-job-panel").textContent).toBe(
      "legacy-job",
    );
    expect(screen.getByTestId("background-job-panel").dataset.command).toBe(
      "npm run dev",
    );
    expect(screen.getByTestId("background-job-panel").dataset.outputFile).toBe(
      "/tmp/legacy-job.log",
    );
  });

  it("renders output from a legacy readBackgroundJobOutput call", () => {
    render(
      <ReadBackgroundJobOutputTool
        {...commonProps}
        tool={{
          type: "tool-readBackgroundJobOutput",
          toolCallId: "read-call",
          state: "output-available",
          input: { backgroundJobId: "legacy-job" },
          output: { output: "ready", status: "running" },
        }}
      />,
    );

    expect(screen.getByTestId("background-job-panel").textContent).toBe(
      "legacy-job",
    );
  });

  it("does not render a detail panel for a failed legacy read", () => {
    render(
      <ReadBackgroundJobOutputTool
        {...commonProps}
        tool={{
          type: "tool-readBackgroundJobOutput",
          toolCallId: "read-call-error",
          state: "output-error",
          input: { backgroundJobId: "missing-job" },
          errorText: "Background job not found.",
        }}
      />,
    );

    expect(screen.queryByTestId("background-job-panel")).toBeNull();
  });
});
