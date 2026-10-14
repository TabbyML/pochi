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

const runningStatus = vi.hoisted(() => ({
  current: undefined as { status: "running"; label: string } | undefined,
  jobIds: [] as (string | undefined)[],
}));

vi.mock("../use-background-job-running-status", () => ({
  useBackgroundJobRunningStatus: (backgroundJobId?: string) => {
    runningStatus.jobIds.push(backgroundJobId);
    return runningStatus.current;
  },
}));

vi.mock("../status-icon", () => ({
  StatusIcon: ({ statusOverride }: { statusOverride?: { status: string } }) => (
    <div data-testid="status-icon" data-status={statusOverride?.status} />
  ),
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
  CommandExecutionPanel: ({ command }: { command: string }) => (
    <div data-testid="foreground-command-panel">{command}</div>
  ),
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
      />,
    );

    const panel = screen.getByTestId("background-job-panel");
    expect(panel.dataset.jobId).toBe("bgjob-cmd-test");
    expect(panel.dataset.outputFile).toBe("/tmp/bgjob-cmd-test.log");
    expect(screen.getByText("toolInvocation.backgroundExecute")).toBeTruthy();
    expect(screen.queryByTestId("command-promotion-transition")).toBeNull();
    expect(screen.queryByTestId("foreground-command-panel")).toBeNull();
  });

  it("shows the foreground-to-background transition when promoted", () => {
    render(
      <ExecuteCommandTool
        tool={{
          type: "tool-executeCommand",
          toolCallId: "promoted-call",
          state: "output-available",
          input: {
            command: "bun run dev",
            cwd: "/workspace",
            background: false,
            timeout: 1,
          },
          output: {
            output: "Command moved to background",
            isTruncated: false,
            _meta: {
              backgroundJobId: "bgjob-cmd-promoted",
              outputFile: "/tmp/bgjob-cmd-promoted.log",
            },
          },
        }}
        isExecuting={false}
        isLoading={false}
      />,
    );

    expect(screen.getByText("toolInvocation.startedCommand")).toBeTruthy();
    expect(screen.queryByTestId("foreground-command-panel")).toBeNull();
    const transition = screen.getByTestId("command-promotion-transition");
    expect(transition).toBeTruthy();
    expect(
      screen.getByText("toolInvocation.promotedToBackground"),
    ).toBeTruthy();
    expect(transition.parentElement?.textContent).toContain(
      "toolInvocation.startedCommand",
    );
    expect(screen.getAllByTestId("background-job-panel")).toHaveLength(1);

    const panel = screen.getByTestId("background-job-panel");
    expect(panel.dataset.jobId).toBe("bgjob-cmd-promoted");
    expect(panel.dataset.outputFile).toBe("/tmp/bgjob-cmd-promoted.log");
  });

  it("spins the status icon while the started job is running", () => {
    runningStatus.current = { status: "running", label: "running" };
    runningStatus.jobIds = [];
    try {
      render(
        <ExecuteCommandTool
          tool={{
            type: "tool-executeCommand",
            toolCallId: "running-call",
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
                backgroundJobId: "bgjob-cmd-running",
                outputFile: "/tmp/bgjob-cmd-running.log",
              },
            },
          }}
          isExecuting={false}
          isLoading={false}
        />,
      );

      expect(runningStatus.jobIds).toContain("bgjob-cmd-running");
      expect(screen.getByTestId("status-icon").dataset.status).toBe("running");
    } finally {
      runningStatus.current = undefined;
    }
  });
});
