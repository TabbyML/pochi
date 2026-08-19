// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { executeCommandTool as ExecuteCommandTool } from "../execute-command";

vi.mock("@/features/chat", () => ({
  useToolCallLifeCycle: () => ({
    getToolCallLifeCycle: () => ({
      abort: vi.fn(),
      streamingResult: undefined,
    }),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("../status-icon", () => ({
  StatusIcon: () => <div data-testid="status-icon" />,
}));

vi.mock("../tool-container", () => ({
  ExpandableToolContainer: ({
    title,
    detail,
  }: {
    title: React.ReactNode;
    detail?: React.ReactNode;
  }) => (
    <div>
      {title}
      {detail}
    </div>
  ),
}));

vi.mock("../command-execution-panel", () => ({
  BackgroundJobPanel: ({
    backgroundJobId,
    outputFile,
  }: {
    backgroundJobId: string;
    outputFile?: string;
  }) => (
    <div
      data-testid="background-job-panel"
      data-job-id={backgroundJobId}
      data-output-file={outputFile}
    />
  ),
  CommandExecutionPanel: () => null,
  CommandPanelContainer: () => null,
  CopyCommandButton: () => null,
}));

describe("executeCommandTool", () => {
  it("passes a background command output file to the job panel", () => {
    render(
      <ExecuteCommandTool
        tool={{
          type: "tool-executeCommand",
          toolCallId: "execute-call",
          state: "output-available",
          input: {
            command: "bun run dev",
            cwd: "/workspace",
            background: true,
            timeout: 60,
          },
          output: {
            output: "Background command started",
            isTruncated: false,
            _meta: {
              backgroundJobId: "bgjob-cmd-test",
              outputFile: "/tmp/bgjob-cmd-test.log",
            },
          },
        }}
        isExecuting={false}
        isLoading={false}
        messages={[]}
      />,
    );

    const panel = screen.getByTestId("background-job-panel");
    expect(panel.dataset.jobId).toBe("bgjob-cmd-test");
    expect(panel.dataset.outputFile).toBe("/tmp/bgjob-cmd-test.log");
  });
});
