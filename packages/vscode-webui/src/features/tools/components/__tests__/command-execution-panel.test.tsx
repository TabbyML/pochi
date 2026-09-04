// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundJobPanel } from "../command-execution-panel";

const openBackgroundJobTerminal = vi.fn();
const showBackgroundCommand = vi.fn();
const openFile = vi.fn();
let terminals:
  | { backgroundJobId: string; name: string; isActive: boolean }[]
  | undefined = [];
let backgroundCommands: Record<string, { isVisible: boolean }> | undefined = {};
let jobInfo: { command: string | undefined; displayId: string } | undefined;

vi.stubGlobal(
  "ResizeObserver",
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/features/chat", () => ({
  useBackgroundJobInfo: () => jobInfo,
}));

vi.mock("@/lib/hooks/use-background-commands", () => ({
  useBackgroundCommands: () => ({
    backgroundCommands,
    show: showBackgroundCommand,
  }),
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
    showBackgroundCommand.mockClear();
    openFile.mockClear();
    terminals = [];
    backgroundCommands = {};
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

  it("opens a visible user terminal without waiting for background commands", () => {
    terminals = [{ backgroundJobId: "term-1", name: "zsh", isActive: true }];
    backgroundCommands = undefined;

    renderTerminalPanel("/tmp/term-1.log");

    fireEvent.click(
      screen.getByLabelText("commandExecutionPanel.openTerminal"),
    );
    expect(openBackgroundJobTerminal).toHaveBeenCalledWith("term-1");
  });

  it("opens a detachable background command through its dedicated control", () => {
    terminals = [
      { backgroundJobId: "bgjob-cmd-1", name: "zsh", isActive: false },
    ];
    backgroundCommands = {
      "bgjob-cmd-1": { isVisible: false },
    };

    renderBackgroundJobPanel("/tmp/bgjob-cmd-1.log");

    fireEvent.click(screen.getByLabelText("commandExecutionPanel.openJob"));
    expect(showBackgroundCommand).toHaveBeenCalledWith("bgjob-cmd-1");
    expect(openBackgroundJobTerminal).not.toHaveBeenCalled();
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

  it("does not offer job output before background commands are loaded", () => {
    backgroundCommands = undefined;

    renderBackgroundJobPanel("/tmp/bgjob-cmd-1.log");

    expect(
      screen.queryByLabelText("commandExecutionPanel.terminalClosedOpenOutput"),
    ).toBeNull();
  });

  it("opens the output file from the notification row and shows its summary tooltip", async () => {
    jobInfo = undefined;
    const fullSummary =
      'Background command "echo 123" completed with exit code 0';

    const { container } = render(
      <BackgroundJobPanel
        backgroundJobId="bgjob-cmd-1"
        appearance="notification"
        command="echo 123"
        summary={fullSummary}
        status="completed"
        exitCode={0}
        outputFile="/tmp/bgjob-cmd-1.log"
      />,
    );

    const terminalIcon = container.querySelector(".lucide-terminal");
    const terminalControl = terminalIcon?.parentElement;
    expect(terminalIcon?.classList.contains("size-3")).toBe(true);
    expect(terminalControl?.classList.contains("bg-secondary")).toBe(true);
    expect(terminalControl?.classList.contains("size-[16px]")).toBe(true);
    expect(terminalControl?.classList.contains("h-8")).toBe(false);
    expect(terminalControl?.classList.contains("px-3")).toBe(false);
    expect(screen.getByText("echo 123")).toBeDefined();
    expect(container.querySelector(".lucide-badge-check")).toBeNull();
    const row = screen.getByLabelText("backgroundJobNotifications.openOutput");
    expect(row.getAttribute("data-slot")).toBe("tooltip-trigger");
    expect(screen.queryByText(fullSummary)).toBeNull();

    fireEvent.pointerMove(row, { pointerType: "mouse" });
    await waitFor(() =>
      expect(screen.getByRole("tooltip").textContent).toContain(fullSummary),
    );

    fireEvent.click(row);
    expect(openFile).toHaveBeenCalledWith("/tmp/bgjob-cmd-1.log");
    expect(openBackgroundJobTerminal).not.toHaveBeenCalled();
    expect(screen.queryByText("Job 1")).toBeNull();
  });

  it("opens the output file from the notification row while its terminal is live", () => {
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
        outputFile="/tmp/bgjob-cmd-1.log"
      />,
    );

    fireEvent.click(
      screen.getByLabelText("backgroundJobNotifications.openOutput"),
    );
    expect(openFile).toHaveBeenCalledWith("/tmp/bgjob-cmd-1.log");
    expect(openBackgroundJobTerminal).not.toHaveBeenCalled();
  });

  it("truncates a long notification command", () => {
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
    expect(screen.queryByText("bgjob-cmd-legacy")).toBeNull();
  });

  it("does not render a trailing status icon for a stopped notification", () => {
    jobInfo = undefined;

    const { container } = render(
      <BackgroundJobPanel
        backgroundJobId="bgjob-cmd-1"
        appearance="notification"
        command="sleep 60"
        summary={'Background command "sleep 60" was stopped'}
        status="stopped"
      />,
    );

    expect(container.querySelector(".lucide-octagon")).toBeNull();
    expect(container.querySelectorAll(".lucide-terminal")).toHaveLength(1);
  });

  it("puts failure details in the notification row tooltip without a trailing icon", async () => {
    jobInfo = undefined;
    const fullSummary =
      'Background command "bun run build" failed: dependency unavailable';

    const { container } = render(
      <BackgroundJobPanel
        backgroundJobId="bgjob-cmd-1"
        appearance="notification"
        command="bun run build"
        summary={fullSummary}
        status="failed"
        outputFile="/tmp/bgjob-cmd-1.log"
      />,
    );

    expect(screen.getByText("bun run build")).toBeDefined();
    expect(container.querySelector(".lucide-triangle-alert")).toBeNull();
    const row = screen.getByLabelText("backgroundJobNotifications.openOutput");
    expect(screen.queryByText(fullSummary)).toBeNull();

    fireEvent.pointerMove(row, { pointerType: "mouse" });
    await waitFor(() =>
      expect(screen.getByRole("tooltip").textContent).toContain(fullSummary),
    );
  });
});
