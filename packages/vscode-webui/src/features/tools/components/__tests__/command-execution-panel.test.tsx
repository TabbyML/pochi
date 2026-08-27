// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundJobPanel } from "../command-execution-panel";

const openBackgroundJobTerminal = vi.fn();
const openFile = vi.fn();
let terminals:
  | { backgroundJobId: string; name: string; isActive: boolean }[]
  | undefined = [];
let jobInfo: { command: string | undefined; displayId: string } | undefined;

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/features/chat", () => ({
  useBackgroundJobInfo: () => jobInfo,
}));

vi.mock("@/lib/hooks/use-visible-terminals", () => ({
  useVisibleTerminals: () => ({
    terminals,
    openBackgroundJobTerminal,
  }),
}));

vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => false,
  vscodeHost: {
    openFile: (path: string) => openFile(path),
  },
}));

vi.mock("../xterm", () => ({
  XTerm: () => null,
}));

const renderTerminalPanel = (outputFile?: string) =>
  render(
    <BackgroundJobPanel
      backgroundJobId="term-1"
      output="terminal output"
      outputFile={outputFile}
      terminalName="zsh"
      lastCommand="ll"
    />,
  );

const renderBackgroundJobPanel = (outputFile?: string) =>
  render(
    <BackgroundJobPanel
      backgroundJobId="bgjob-cmd-1"
      output="job output"
      outputFile={outputFile}
    />,
  );

describe("BackgroundJobPanel job control", () => {
  beforeEach(() => {
    openBackgroundJobTerminal.mockClear();
    openFile.mockClear();
    terminals = [];
    jobInfo = { command: "bun run dev", displayId: "%1" };
  });

  it("opens the terminal while it is still visible", () => {
    terminals = [{ backgroundJobId: "term-1", name: "zsh", isActive: true }];

    renderTerminalPanel("/tmp/term-1.log");

    fireEvent.click(
      screen.getByLabelText("commandExecutionPanel.openTerminal"),
    );
    expect(openBackgroundJobTerminal).toHaveBeenCalledWith("term-1");
    expect(openFile).not.toHaveBeenCalled();
  });

  it("opens the output file once the user terminal is gone", () => {
    renderTerminalPanel("/tmp/term-1.log");

    fireEvent.click(
      screen.getByLabelText("commandExecutionPanel.terminalClosedOpenOutput"),
    );
    expect(openFile).toHaveBeenCalledWith("/tmp/term-1.log");
    expect(openBackgroundJobTerminal).not.toHaveBeenCalled();
  });

  it("opens the output file once the background job terminal is gone", () => {
    renderBackgroundJobPanel("/tmp/bgjob-cmd-1.log");

    fireEvent.click(
      screen.getByLabelText("commandExecutionPanel.terminalClosedOpenOutput"),
    );
    expect(openFile).toHaveBeenCalledWith("/tmp/bgjob-cmd-1.log");
    expect(openBackgroundJobTerminal).not.toHaveBeenCalled();
  });

  it("top-aligns the display ID with a multi-line command", () => {
    terminals = [
      { backgroundJobId: "bgjob-cmd-1", name: "zsh", isActive: false },
    ];
    jobInfo = {
      command: `bun run build ${"--filter package ".repeat(20)}`,
      displayId: "%1",
    };

    renderBackgroundJobPanel();

    const displayId = screen.getByLabelText("commandExecutionPanel.openJob");
    expect(displayId.parentElement?.classList.contains("self-start")).toBe(
      true,
    );
  });

  it("keeps an inert badge when there is no output file to fall back to", () => {
    renderTerminalPanel();

    fireEvent.click(
      screen.getByLabelText("commandExecutionPanel.terminalClosed"),
    );
    expect(openFile).not.toHaveBeenCalled();
    expect(openBackgroundJobTerminal).not.toHaveBeenCalled();
  });

  it("does not claim the terminal is closed before terminals are loaded", () => {
    terminals = undefined;

    renderTerminalPanel("/tmp/term-1.log");

    expect(
      screen.queryByLabelText("commandExecutionPanel.terminalClosed"),
    ).toBeNull();
    expect(
      screen.queryByLabelText("commandExecutionPanel.openTerminal"),
    ).toBeNull();
  });

  it("shows a terminal command followed by its lifecycle summary", () => {
    jobInfo = undefined;

    const { container } = render(
      <BackgroundJobPanel
        backgroundJobId="bgjob-cmd-1"
        appearance="notification"
        command="echo 123"
        summary={'Background command "echo 123" completed with exit code 0'}
        status="completed"
        exitCode={0}
        outputFile="/tmp/bgjob-cmd-1.log"
      />,
    );

    expect(container.querySelector(".lucide-terminal")).toBeTruthy();
    expect(screen.getByText("echo 123")).toBeDefined();
    const summary = screen.getByText("Completed with exit code 0");
    const statusIcon = container.querySelector(".lucide-check");
    expect(statusIcon?.getAttribute("aria-hidden")).toBe("true");
    expect(statusIcon?.getAttribute("data-slot")).toBeNull();
    expect(summary.parentElement?.lastElementChild).toBe(statusIcon);
    expect(screen.queryByLabelText("Completed with exit code 0")).toBeNull();
    expect(
      screen.queryByLabelText("backgroundJobNotifications.openOutput"),
    ).toBeNull();

    fireEvent.click(
      screen.getByLabelText("commandExecutionPanel.terminalClosedOpenOutput"),
    );
    expect(openFile).toHaveBeenCalledWith("/tmp/bgjob-cmd-1.log");
    expect(screen.queryByText("Job 1")).toBeNull();
  });

  it("opens a live background terminal from the notification terminal button", () => {
    jobInfo = undefined;
    terminals = [
      { backgroundJobId: "bgjob-cmd-1", name: "zsh", isActive: false },
    ];

    render(
      <BackgroundJobPanel
        backgroundJobId="bgjob-cmd-1"
        appearance="notification"
        command="echo 123"
        summary={'Background command "echo 123" completed with exit code 0'}
        status="completed"
      />,
    );

    fireEvent.click(screen.getByLabelText("commandExecutionPanel.openJob"));
    expect(openBackgroundJobTerminal).toHaveBeenCalledWith("bgjob-cmd-1");
  });

  it("truncates a long command without squeezing out its lifecycle summary", () => {
    jobInfo = undefined;
    const longCommand = `bun run build ${"--filter package ".repeat(20)}`;

    const { container } = render(
      <BackgroundJobPanel
        backgroundJobId="bgjob-cmd-1"
        appearance="notification"
        command={longCommand}
        summary={`Background command "${longCommand}" completed with exit code 0`}
        status="completed"
      />,
    );

    const command = container.querySelector("code");
    expect(command?.classList.contains("truncate")).toBe(true);
    expect(command?.getAttribute("title")).toBe(longCommand);
    expect(command?.textContent).toBe(longCommand);
    expect(screen.getByText("Completed with exit code 0")).toBeDefined();
  });

  it("recovers the actual command when structured data contains a legacy ID", () => {
    jobInfo = undefined;
    const command = 'sleep 5 && echo "notification completed"';

    render(
      <BackgroundJobPanel
        backgroundJobId="bgjob-cmd-legacy"
        appearance="notification"
        command="bgjob-cmd-legacy"
        summary={`Background command "${command}" completed`}
        status="completed"
      />,
    );

    expect(screen.getByText(command)).toBeDefined();
    expect(screen.getByText("Completed")).toBeDefined();
    expect(screen.queryByText("bgjob-cmd-legacy")).toBeNull();
  });

  it("preserves failure details from the notification summary", () => {
    jobInfo = undefined;

    render(
      <BackgroundJobPanel
        backgroundJobId="bgjob-cmd-1"
        appearance="notification"
        command="bun run build"
        summary={
          'Background command "bun run build" failed: dependency unavailable'
        }
        status="failed"
        outputFile="/tmp/bgjob-cmd-1.log"
      />,
    );

    expect(screen.getByText("bun run build")).toBeDefined();
    expect(screen.getByText("Failed: dependency unavailable")).toBeDefined();
  });
});
