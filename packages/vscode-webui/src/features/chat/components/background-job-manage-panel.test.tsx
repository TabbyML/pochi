// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackgroundJobEntry } from "../lib/build-background-job-list";
import { BackgroundJobManagePanel } from "./background-job-manage-panel";

const show = vi.fn();
const hide = vi.fn();
const close = vi.fn();
const openFile = vi.fn();
const copyToClipboard = vi.fn();
let backgroundJobs: BackgroundJobEntry[] = [];
let backgroundCommands: Record<string, { isVisible: boolean }> | undefined = {};
let isDevMode = false;
let backgroundTasks: Array<{ id: string; title: string }> = [];

// Radix positions the tooltip with one, and jsdom has none.
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
    // Keys stand in for their translations, with the exit code interpolated.
    t: (key: string, options?: { exitCode?: number }) =>
      options?.exitCode === undefined ? key : `${key} ${options.exitCode}`,
  }),
}));

// The drawer is rendered inline so the content is always assertable.
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetTitle: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../hooks/use-background-job-list", () => ({
  useBackgroundJobList: () => backgroundJobs,
}));

vi.mock("@/lib/hooks/use-background-commands", () => ({
  useBackgroundCommands: () => ({ backgroundCommands, show, hide, close }),
}));

vi.mock("@/lib/vscode", () => ({
  vscodeHost: {
    openFile: (path: string) => openFile(path),
  },
}));

// jsdom has no working clipboard.
vi.mock("@/lib/hooks/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => ({ isCopied: false, copyToClipboard }),
}));

vi.mock("@/features/settings", () => ({
  useIsDevMode: () => [isDevMode],
}));

vi.mock("./background-task-debug-panel", () => ({
  BackgroundTasksLabel: "Background tasks",
  useBackgroundTasks: () => backgroundTasks,
  BackgroundTaskRow: ({
    task,
    onSelect,
  }: {
    task: { title: string };
    onSelect: () => void;
  }) => (
    <button type="button" onClick={onSelect}>
      {task.title}
    </button>
  ),
  BackgroundTaskDetail: ({
    taskId,
    onBack,
  }: {
    taskId: string;
    onBack: () => void;
  }) => (
    <div data-testid="background-task-detail">
      {taskId}
      <button type="button" onClick={onBack}>
        back
      </button>
    </div>
  ),
}));

const renderBackgroundJobManagePanel = () =>
  render(<BackgroundJobManagePanel taskId="task-1" messages={[]} />);

const rowTitles = () =>
  screen.getAllByRole("listitem").map((row) => row.textContent);

const runningJob = {
  backgroundJobId: "bgjob-cmd-1",
  displayId: "%1",
  title: "bun run dev",
  command: "bun run dev",
  status: "running" as const,
};

const runningRow = {
  ...runningJob,
  displayId: undefined,
  title: "running",
};
const finishedRow = {
  ...runningRow,
  backgroundJobId: "bgjob-cmd-2",
  title: "done",
  status: "completed" as const,
};

describe("BackgroundJobManagePanel", () => {
  beforeEach(() => {
    show.mockClear();
    hide.mockClear();
    close.mockClear();
    openFile.mockClear();
    copyToClipboard.mockClear();
    backgroundJobs = [];
    backgroundCommands = { "bgjob-cmd-1": { isVisible: true } };
    isDevMode = false;
    backgroundTasks = [];
  });

  it("keeps the trigger bare when there is nothing running", () => {
    const { container } = renderBackgroundJobManagePanel();

    const trigger = screen.getByTestId("background-job-manage-panel-toggle");
    expect(trigger.textContent).toBe("");
    expect(trigger.getAttribute("aria-label")).toBe("managePanel.toggle");
    expect(trigger.querySelector("svg")?.classList.contains("size-4.5")).toBe(
      true,
    );
    expect(trigger.querySelector(".bg-blue-500")).toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(screen.getByText("managePanel.empty")).toBeDefined();
    expect(screen.queryByText("managePanel.pochiGroup")).toBeNull();
  });

  it("badges the trigger while a command is running", () => {
    backgroundJobs = [runningJob];

    const { container } = renderBackgroundJobManagePanel();

    const trigger = screen.getByTestId("background-job-manage-panel-toggle");
    expect(trigger.textContent).toBe("1");
    expect(trigger.querySelector(".bg-blue-500")?.textContent).toBe("1");
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(screen.getByText("bun run dev")).toBeDefined();
    expect(screen.queryByText("managePanel.empty")).toBeNull();
  });

  it("drops the badge once every command has finished", () => {
    backgroundJobs = [{ ...runningJob, status: "completed" }];

    const { container } = renderBackgroundJobManagePanel();

    expect(
      screen
        .getByTestId("background-job-manage-panel-toggle")
        .querySelector(".bg-blue-500"),
    ).toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("collapses a section from its title", () => {
    backgroundJobs = [runningJob];

    renderBackgroundJobManagePanel();

    const title = screen.getByText("managePanel.pochiGroup");
    expect(title.classList.contains("text-sm")).toBe(true);
    expect(title.classList.contains("font-medium")).toBe(true);
    expect(title.classList.contains("text-muted-foreground")).toBe(true);

    const sectionHeader = title.closest("button");
    expect(
      sectionHeader?.querySelector("svg")?.classList.contains("size-4"),
    ).toBe(true);
    expect(sectionHeader?.lastElementChild?.classList.contains("text-sm")).toBe(
      true,
    );
    expect(
      sectionHeader?.lastElementChild?.classList.contains(
        "text-muted-foreground/70",
      ),
    ).toBe(true);

    fireEvent.click(title);
    expect(screen.queryByText("bun run dev")).toBeNull();

    fireEvent.click(title);
    expect(screen.getByText("bun run dev")).toBeDefined();
  });

  it("holds a long category back behind a see-more toggle", () => {
    backgroundJobs = Array.from({ length: 7 }, (_, index) => ({
      backgroundJobId: `bgjob-cmd-${index}`,
      displayId: `%${index}`,
      title: `bun run dev ${index}`,
      status: "completed" as const,
    }));

    renderBackgroundJobManagePanel();

    expect(screen.getByText("bun run dev 4")).toBeDefined();
    expect(screen.queryByText("bun run dev 5")).toBeNull();

    fireEvent.click(screen.getByText("managePanel.seeMore"));
    expect(screen.getByText("bun run dev 6")).toBeDefined();

    fireEvent.click(screen.getByText("managePanel.seeLess"));
    expect(screen.queryByText("bun run dev 5")).toBeNull();
  });

  it("explains a row by its command, and stays quiet without one", () => {
    backgroundJobs = [
      runningJob,
      {
        ...runningJob,
        backgroundJobId: "bgjob-cmd-2",
        title: "bgjob-cmd-2",
        command: undefined,
      },
    ];

    renderBackgroundJobManagePanel();

    expect(screen.getByText("bun run dev").dataset.slot).toBe(
      "tooltip-trigger",
    );
    expect(screen.getByText("bgjob-cmd-2").dataset.slot).toBeUndefined();
  });

  it("says how a command ended on hover, exit code included", async () => {
    backgroundJobs = [
      { ...runningJob, status: "failed" as const, exitCode: 127 },
    ];

    renderBackgroundJobManagePanel();

    fireEvent.pointerMove(screen.getByText("bun run dev"), {
      pointerType: "mouse",
    });

    await waitFor(() => {
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip.textContent).toContain("bun run dev");
      expect(tooltip.textContent).toContain(
        "backgroundJobNotifications.failed 127",
      );
    });
  });

  it("numbers a row without asking to be clicked", () => {
    backgroundJobs = [runningJob];

    renderBackgroundJobManagePanel();

    const displayId = screen.getByText("%1");
    expect(displayId.tagName).toBe("SPAN");
    expect(displayId.closest("button")).toBeNull();
    expect(displayId.className).toContain("group-hover:opacity-0");
  });

  it("keeps the number for a row that has nothing to press", () => {
    backgroundJobs = [
      { ...runningJob, status: "stopped" as const, command: undefined },
    ];

    renderBackgroundJobManagePanel();

    expect(screen.getByText("%1").className).not.toContain(
      "group-hover:opacity-0",
    );
  });

  it("lights the number only while the command terminal is visible", () => {
    backgroundJobs = [runningJob];

    const { rerender } = renderBackgroundJobManagePanel();
    expect(screen.getByText("%1").className).toContain("ring-1");

    backgroundCommands = { "bgjob-cmd-1": { isVisible: false } };
    rerender(<BackgroundJobManagePanel taskId="task-1" messages={[]} />);
    expect(screen.getByText("%1").className).not.toContain("ring-1");
  });

  it("puts a running command's terminal on screen by clicking its row", () => {
    backgroundJobs = [runningJob];

    renderBackgroundJobManagePanel();

    const row = screen.getByText("bun run dev").closest('[role="button"]');
    expect(row).not.toBeNull();
    if (row) fireEvent.click(row);
    expect(show).toHaveBeenCalledWith("bgjob-cmd-1");
  });

  it("reads a finished command back by clicking its row", () => {
    backgroundJobs = [
      {
        ...runningJob,
        status: "completed" as const,
        outputFile: "/tmp/bgjob-cmd-1.log",
      },
    ];

    renderBackgroundJobManagePanel();

    const row = screen.getByText("bun run dev").closest('[role="button"]');
    expect(row).not.toBeNull();
    if (row) fireEvent.click(row);
    expect(openFile).toHaveBeenCalledWith("/tmp/bgjob-cmd-1.log");
    expect(show).not.toHaveBeenCalled();
  });

  it("leaves a row with nothing to open unclickable", () => {
    backgroundJobs = [{ ...runningJob, status: "stopped" as const }];

    renderBackgroundJobManagePanel();

    expect(
      screen.getByText("bun run dev").closest('[role="button"]'),
    ).toBeNull();
  });

  it("keeps a row control from also firing the row", () => {
    backgroundJobs = [runningJob];

    renderBackgroundJobManagePanel();

    fireEvent.click(screen.getByLabelText("managePanel.kill"));
    expect(close).toHaveBeenCalledWith("bgjob-cmd-1");
    expect(show).not.toHaveBeenCalled();
  });

  it("keeps a row control's keyboard event from firing the row", () => {
    backgroundJobs = [runningJob];

    renderBackgroundJobManagePanel();

    fireEvent.keyDown(screen.getByLabelText("managePanel.kill"), {
      key: "Enter",
    });
    expect(show).not.toHaveBeenCalled();
  });

  it("offers a running command a way to put its terminal away and to stop it", () => {
    backgroundJobs = [runningJob];

    renderBackgroundJobManagePanel();

    fireEvent.click(screen.getByLabelText("managePanel.hideTerminal"));
    expect(hide).toHaveBeenCalledWith("bgjob-cmd-1");
    expect(screen.getByLabelText("managePanel.kill")).toBeDefined();
    expect(
      screen.queryByLabelText("backgroundJobNotifications.openOutput"),
    ).toBeNull();
  });

  it("offers back the terminal of a running command whose tab was put away", () => {
    backgroundCommands = { "bgjob-cmd-1": { isVisible: false } };
    backgroundJobs = [runningJob];

    renderBackgroundJobManagePanel();

    fireEvent.click(screen.getByLabelText("managePanel.openTerminal"));
    expect(show).toHaveBeenCalledWith("bgjob-cmd-1");
    // The process outlives its tab, so it can still be stopped.
    expect(screen.getByLabelText("managePanel.kill")).toBeDefined();
  });

  it("offers a finished command its output file", () => {
    backgroundJobs = [
      {
        ...runningJob,
        status: "completed" as const,
        outputFile: "/tmp/bgjob-cmd-1.log",
      },
    ];

    renderBackgroundJobManagePanel();

    const openOutput = screen.getByLabelText(
      "backgroundJobNotifications.openOutput",
    );
    // Only the pointer brings the controls out, and they hold their place in
    // the row while hidden. jsdom has no `:hover`, so the reveal itself cannot
    // be observed here — that they start hidden, and are still clickable, can.
    const controls = openOutput.parentElement;
    expect(controls?.className).toContain("opacity-0");
    expect(controls?.className).toContain("group-hover:opacity-100");

    fireEvent.click(openOutput);
    expect(openFile).toHaveBeenCalledWith("/tmp/bgjob-cmd-1.log");
    expect(screen.queryByLabelText("managePanel.kill")).toBeNull();
    expect(screen.queryByLabelText("managePanel.openTerminal")).toBeNull();
  });

  it("hands a finished command back to the clipboard", () => {
    backgroundJobs = [
      {
        ...runningJob,
        status: "completed" as const,
        outputFile: "/tmp/bgjob-cmd-1.log",
      },
    ];

    renderBackgroundJobManagePanel();

    // Beside the transcript, not instead of it.
    expect(
      screen.getByLabelText("backgroundJobNotifications.openOutput"),
    ).toBeDefined();
    fireEvent.click(screen.getByLabelText("managePanel.copyCommand"));
    expect(copyToClipboard).toHaveBeenCalledWith("bun run dev");
    // The control speaks for itself; the row's own action must not fire too.
    expect(openFile).not.toHaveBeenCalled();
  });

  it("keeps the clipboard control away from a running command", () => {
    backgroundJobs = [runningJob];

    renderBackgroundJobManagePanel();

    expect(screen.queryByLabelText("managePanel.copyCommand")).toBeNull();
  });

  it("leaves a finished command without a transcript with nothing to press", () => {
    backgroundJobs = [
      { ...runningJob, status: "stopped" as const, command: undefined },
    ];

    renderBackgroundJobManagePanel();

    expect(
      screen.queryByLabelText("backgroundJobNotifications.openOutput"),
    ).toBeNull();
    expect(screen.queryByLabelText("managePanel.copyCommand")).toBeNull();
  });

  it("lists running commands first", () => {
    backgroundJobs = [finishedRow, runningRow];

    renderBackgroundJobManagePanel();

    expect(rowTitles()).toEqual(["running", "done"]);
  });

  it("keeps a command in place once it stops", () => {
    backgroundJobs = [finishedRow, runningRow];

    const { rerender } = renderBackgroundJobManagePanel();

    // Killing the top row must not drop it to the bottom under the pointer.
    backgroundJobs = [
      finishedRow,
      { ...runningRow, status: "stopped" as const },
    ];
    rerender(<BackgroundJobManagePanel taskId="task-1" messages={[]} />);

    expect(rowTitles()).toEqual(["running", "done"]);
  });

  it("keeps background tasks out of the panel outside dev mode", () => {
    backgroundTasks = [{ id: "task-1", title: "A background task" }];

    renderBackgroundJobManagePanel();

    expect(screen.queryByText("Background tasks")).toBeNull();
    expect(screen.getByText("managePanel.empty")).toBeDefined();
  });

  it("hides the task section in dev mode while there is no task", () => {
    isDevMode = true;

    renderBackgroundJobManagePanel();

    expect(screen.queryByText("Background tasks")).toBeNull();
    expect(screen.getByText("managePanel.empty")).toBeDefined();
  });

  it("lists background tasks in dev mode", () => {
    isDevMode = true;
    backgroundTasks = [{ id: "task-1", title: "A background task" }];

    renderBackgroundJobManagePanel();

    expect(screen.getByText("Background tasks")).toBeDefined();
    expect(screen.getByText("A background task")).toBeDefined();
    expect(screen.queryByText("managePanel.empty")).toBeNull();
  });

  it("takes the drawer to a task and back again", () => {
    isDevMode = true;
    backgroundTasks = [{ id: "task-1", title: "A background task" }];
    backgroundJobs = [runningJob];

    renderBackgroundJobManagePanel();

    fireEvent.click(screen.getByText("A background task"));
    // The detail covers the list rather than replacing it.
    expect(screen.getByTestId("background-task-detail").textContent).toContain(
      "task-1",
    );
    expect(screen.getByTestId("background-task-layer").dataset.state).toBe(
      "open",
    );
    expect(
      screen.getByTestId("background-job-list-layer").hasAttribute("inert"),
    ).toBe(true);

    fireEvent.click(screen.getByText("back"));
    expect(screen.getByTestId("background-task-layer").dataset.state).toBe(
      "closed",
    );
    expect(
      screen.getByTestId("background-job-list-layer").hasAttribute("inert"),
    ).toBe(false);
  });

  it("keeps the list as it was left while a task is open", () => {
    isDevMode = true;
    backgroundTasks = [{ id: "task-1", title: "A background task" }];
    backgroundJobs = [runningJob];

    renderBackgroundJobManagePanel();

    // Fold the commands, then take a detour through a task detail.
    fireEvent.click(screen.getByText("managePanel.pochiGroup"));
    expect(screen.queryByText("bun run dev")).toBeNull();

    fireEvent.click(screen.getByText("A background task"));
    fireEvent.click(screen.getByText("back"));

    // The list was never unmounted, so it is still folded.
    expect(screen.queryByText("bun run dev")).toBeNull();
  });
});
