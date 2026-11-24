// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeCommandTool as ExecuteCommandTool } from "../execute-command";

const taskCwd = vi.hoisted(() => ({
  current: undefined as string | undefined,
}));

vi.mock("@/features/chat", () => ({
  useTaskCwd: () => taskCwd.current,
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
  beforeEach(() => {
    taskCwd.current = undefined;
  });

  it("hides the cwd when it matches the task cwd", () => {
    taskCwd.current = "/workspace";
    render(
      <ExecuteCommandTool
        tool={{
          type: "tool-executeCommand",
          toolCallId: "default-cwd-call",
          state: "input-available",
          input: {
            command: "bun run test",
            cwd: "/workspace",
          },
        }}
        isExecuting={false}
        isLoading={false}
      />,
    );

    expect(screen.getByText("toolInvocation.executeCommand")).toBeTruthy();
    expect(screen.queryByText("toolInvocation.in")).toBeNull();
  });

  it("shows the cwd when it differs from the task cwd", () => {
    taskCwd.current = "/workspace";
    render(
      <ExecuteCommandTool
        tool={{
          type: "tool-executeCommand",
          toolCallId: "custom-cwd-call",
          state: "input-available",
          input: {
            command: "bun run test",
            cwd: "/workspace/packages/vscode-webui",
          },
        }}
        isExecuting={false}
        isLoading={false}
      />,
    );

    expect(screen.getByText("toolInvocation.in")).toBeTruthy();
  });

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

  it("titles a background command by its description and keeps the command in the job panel", () => {
    render(
      <ExecuteCommandTool
        tool={{
          type: "tool-executeCommand",
          toolCallId: "described-call",
          state: "output-available",
          input: {
            command: "cd /workspace/packages/vscode-webui && bun run test",
            description: " Run vscode-webui unit tests ",
            cwd: "/workspace",
            background: true,
            timeout: 60,
          },
          output: {
            output: "Background command started",
            isTruncated: false,
            _meta: {
              backgroundJobId: "bgjob-cmd-described",
              outputFile: "/tmp/bgjob-cmd-described.log",
            },
          },
        }}
        isExecuting={false}
        isLoading={false}
      />,
    );

    expect(
      screen.getByText("toolInvocation.backgroundExecuteDescribed"),
    ).toBeTruthy();
    expect(screen.getByText("Run vscode-webui unit tests")).toBeTruthy();
    expect(screen.queryByText("toolInvocation.backgroundExecute")).toBeNull();
    expect(screen.getByTestId("background-job-panel").dataset.jobId).toBe(
      "bgjob-cmd-described",
    );
  });

  it("titles a promoted command by its description", () => {
    taskCwd.current = "/workspace";
    render(
      <ExecuteCommandTool
        tool={{
          type: "tool-executeCommand",
          toolCallId: "promoted-described-call",
          state: "output-available",
          input: {
            command: "bun run build",
            description: "Build the extension",
            cwd: "/workspace",
            timeout: 1,
          },
          output: {
            output: "Command moved to background",
            isTruncated: false,
            _meta: {
              backgroundJobId: "bgjob-cmd-promoted-described",
              outputFile: "/tmp/bgjob-cmd-promoted-described.log",
            },
          },
        }}
        isExecuting={false}
        isLoading={false}
      />,
    );

    const transition = screen.getByTestId("command-promotion-transition");
    expect(transition.parentElement?.textContent).toBe(
      "toolInvocation.startedCommandDescribed Build the extensiontoolInvocation.promotedToBackground",
    );
  });

  it("keeps the generic title for a foreground command with a description", () => {
    render(
      <ExecuteCommandTool
        tool={{
          type: "tool-executeCommand",
          toolCallId: "foreground-described-call",
          state: "input-available",
          input: {
            command: "git status",
            description: "Check working tree status",
            cwd: "/workspace",
          },
        }}
        isExecuting={false}
        isLoading={false}
      />,
    );

    expect(screen.getByText("toolInvocation.executeCommand")).toBeTruthy();
    expect(screen.queryByText("Check working tree status")).toBeNull();
    expect(screen.getByTestId("foreground-command-panel").textContent).toBe(
      "git status",
    );
  });

  it("falls back to the generic title for a blank description", () => {
    render(
      <ExecuteCommandTool
        tool={{
          type: "tool-executeCommand",
          toolCallId: "blank-description-call",
          state: "input-available",
          input: {
            command: "bun run dev",
            description: "  ",
            cwd: "/workspace",
            background: true,
          },
        }}
        isExecuting={false}
        isLoading={false}
      />,
    );

    expect(screen.getByText("toolInvocation.backgroundExecute")).toBeTruthy();
  });

  it("leaves the job state to the badge instead of the status icon", () => {
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

    expect(screen.getByTestId("status-icon").dataset.status).toBeUndefined();
    expect(screen.getByTestId("background-job-panel").dataset.jobId).toBe(
      "bgjob-cmd-running",
    );
  });
});
