// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Activity } from "lucide-react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundJobPanel } from "../command-execution-panel";

const openBackgroundJobTerminal = vi.fn();
const showBackgroundCommand = vi.fn();
const openFile = vi.fn();
let terminals:
  | { backgroundJobId: string; name: string; isActive: boolean }[]
  | undefined = [];
let backgroundCommands:
  | Record<string, { isVisible: boolean; detachable?: boolean }>
  | undefined = {};
let jobInfo:
  | { command: string | undefined; displayId: string; outputFile?: string }
  | undefined;

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

  it("opens the output file of a finished job even if its terminal tab is still open", () => {
    terminals = [
      { backgroundJobId: "bgjob-cmd-1", name: "zsh", isActive: false },
    ];

    renderBackgroundJobPanel("/tmp/bgjob-cmd-1.log");

    fireEvent.click(
      screen.getByLabelText("commandExecutionPanel.terminalClosedOpenOutput"),
    );
    expect(openFile).toHaveBeenCalledWith("/tmp/bgjob-cmd-1.log");
    expect(showBackgroundCommand).not.toHaveBeenCalled();
    expect(openBackgroundJobTerminal).not.toHaveBeenCalled();
  });

  it("opens the output file of a running job that has no terminal view", () => {
    backgroundCommands = {
      "bgjob-cmd-1": { isVisible: false, detachable: false },
    };

    renderBackgroundJobPanel("/tmp/bgjob-cmd-1.log");

    fireEvent.click(
      screen.getByLabelText("backgroundJobNotifications.openOutput"),
    );
    expect(openFile).toHaveBeenCalledWith("/tmp/bgjob-cmd-1.log");
    expect(showBackgroundCommand).not.toHaveBeenCalled();
  });

  it("falls back to the output file recorded by the start card", () => {
    jobInfo = {
      command: "bun run dev",
      displayId: "%1",
      outputFile: "/tmp/recorded.log",
    };

    renderBackgroundJobPanel();

    fireEvent.click(
      screen.getByLabelText("commandExecutionPanel.terminalClosedOpenOutput"),
    );
    expect(openFile).toHaveBeenCalledWith("/tmp/recorded.log");
  });

  it("leaves the badge as the only way to open the job", () => {
    backgroundCommands = { "bgjob-cmd-1": { isVisible: false } };

    renderBackgroundJobPanel("/tmp/bgjob-cmd-1.log");

    expect(
      screen.queryByLabelText("backgroundJobNotifications.openOutput"),
    ).toBeNull();
    expect(document.querySelector(".lucide-file-text")).toBeNull();
  });

  it("top-aligns the display ID with a multi-line command", () => {
    backgroundCommands = { "bgjob-cmd-1": { isVisible: false } };
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

  it("collapses monitor events and keeps scrollable details on hover", async () => {
    jobInfo = undefined;
    const output = "first log\nsecond log\nkill requested";
    const { container } = render(
      <BackgroundJobPanel
        backgroundJobId="bgjob-monitor-1"
        appearance="notification"
        command="watch logs"
        notificationTitle="Simulated log entries"
        notificationIcon={<Activity className="size-3" />}
        notificationEvents={[{ id: "event-1", text: output }]}
        status="stopped"
        outputFile="/tmp/monitor.log"
      />,
    );
    const row = screen.getByRole("button", {
      name: "commandExecutionPanel.expand",
    });
    expect(row.textContent).toBe("Simulated log entries");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/first log/)).toBeNull();
    expect(row.parentElement?.querySelector(".lucide-activity")).not.toBeNull();
    expect(row.querySelector(".lucide-circle-slash")).not.toBeNull();
    expect(row.querySelector(".lucide-chevron-left")).not.toBeNull();
    expect(row.querySelector("code")?.classList.contains("truncate")).toBe(
      true,
    );
    fireEvent.click(row);
    expect(row.getAttribute("aria-expanded")).toBe("true");
    const event = screen.getByText(/first log/);
    expect(event.textContent).toBe(output);
    expect(event.classList.contains("truncate")).toBe(true);
    fireEvent.pointerMove(event, { pointerType: "mouse" });
    await waitFor(() => {
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip.textContent).toContain(output);
      expect(tooltip.querySelector(".overflow-y-auto")).not.toBeNull();
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: "commandExecutionPanel.collapse",
      }),
    );
    expect(row.getAttribute("aria-expanded")).toBe("false");
    expect(
      container.querySelector("[data-slot='collapsible-content'] code"),
    ).toBeNull();
    expect(openFile).not.toHaveBeenCalled();
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

  it("shows the job number of a tracked job in place of the type icon", () => {
    jobInfo = { command: "echo 123", displayId: "%2" };

    const { container } = render(
      <BackgroundJobPanel
        backgroundJobId="bgjob-cmd-1"
        appearance="notification"
        summary={'Background command "echo 123" completed with exit code 0'}
        status="completed"
        outputFile="/tmp/bgjob-cmd-1.log"
      />,
    );

    const row = screen.getByLabelText("backgroundJobNotifications.openOutput");
    const displayId = screen.getByLabelText(
      "commandExecutionPanel.terminalClosedOpenOutput",
    );
    expect(displayId.textContent).toBe("%2");
    expect(displayId.nextElementSibling).toBe(row);
    expect(container.querySelector(".lucide-terminal")).toBeNull();
    fireEvent.click(displayId);
    expect(openFile).toHaveBeenCalledWith("/tmp/bgjob-cmd-1.log");
    fireEvent.click(row);
    expect(openFile).toHaveBeenCalledTimes(2);
  });

  it("opens a running monitor's terminal from its notification job number", () => {
    jobInfo = { command: "watch logs", displayId: "%5" };
    backgroundCommands = { "bgjob-monitor-1": { isVisible: false } };

    render(
      <BackgroundJobPanel
        backgroundJobId="bgjob-monitor-1"
        appearance="notification"
        command="watch logs"
        notificationTitle="Simulated log entries"
        notificationEvents={[{ id: "event-1", text: "first log" }]}
        outputFile="/tmp/monitor.log"
      />,
    );

    const row = screen.getByRole("button", {
      name: "commandExecutionPanel.expand",
    });
    const displayId = screen.getByLabelText("commandExecutionPanel.openJob");
    expect(displayId.textContent).toBe("%5");
    expect(row.contains(displayId)).toBe(false);

    fireEvent.click(displayId);
    expect(showBackgroundCommand).toHaveBeenCalledWith("bgjob-monitor-1");
    expect(openFile).not.toHaveBeenCalled();
    expect(row.getAttribute("aria-expanded")).toBe("false");
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
    expect(command?.nextElementSibling?.classList.contains("size-3.5")).toBe(
      true,
    );
    expect(command?.nextElementSibling?.childElementCount).toBe(0);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(container.querySelector(".lucide-terminal")).not.toBeNull();
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

  it("renders a trailing stopped icon while retaining the terminal icon", () => {
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

    expect(container.querySelector("code")?.nextElementSibling).toBe(
      container.querySelector(".lucide-circle-slash")?.parentElement,
    );
    expect(container.querySelectorAll(".lucide-circle-slash")).toHaveLength(1);
    expect(container.querySelectorAll(".lucide-terminal")).toHaveLength(1);
  });

  it("shows a trailing failure icon with details in the notification row tooltip", async () => {
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
    expect(container.querySelectorAll(".lucide-triangle-alert")).toHaveLength(
      1,
    );
    expect(container.querySelector("code")?.nextElementSibling).toBe(
      container.querySelector(".lucide-triangle-alert")?.parentElement,
    );
    const row = screen.getByLabelText("backgroundJobNotifications.openOutput");
    expect(screen.queryByText(fullSummary)).toBeNull();

    fireEvent.pointerMove(row, { pointerType: "mouse" });
    await waitFor(() =>
      expect(screen.getByRole("tooltip").textContent).toContain(fullSummary),
    );
  });
});
