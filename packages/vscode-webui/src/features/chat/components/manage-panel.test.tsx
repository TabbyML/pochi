// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobList } from "../lib/build-job-list";
import { ManagePanel } from "./manage-panel";

const openTerminal = vi.fn();
const openOutputFile = vi.fn();
let jobList: JobList = { pochi: [] };
let openState = { isTerminalClosed: false, canOpenOutputFile: false };
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
    // Keys stand in for their translations; the exit code is interpolated so
    // the hover text can be asserted.
    t: (key: string, options?: { exitCode?: number }) =>
      options?.exitCode === undefined ? key : `${key} ${options.exitCode}`,
  }),
}));

// The drawer is rendered inline so the content is always assertable; opening
// and closing it is Radix's responsibility, not this component's.
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetTitle: ({ children }: { children: ReactNode }) => <>{children}</>,
  SheetTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("../hooks/use-job-list", () => ({
  useJobList: () => jobList,
}));

vi.mock("@/lib/hooks/use-open-background-job", () => ({
  useOpenBackgroundJob: () => ({
    ...openState,
    openTerminal,
    openOutputFile,
  }),
}));

vi.mock("@/features/settings", () => ({
  useIsDevMode: () => [isDevMode],
}));

// The dev-only task surface has its own tests; here only its place in the
// panel matters.
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

const renderPanel = () => render(<ManagePanel taskId="task-1" messages={[]} />);

/** The rows in the order the panel lists them. */
const rowTitles = () =>
  screen.getAllByRole("listitem").map((row) => row.textContent);

const runningJob = {
  backgroundJobId: "bgjob-cmd-1",
  displayId: "%1",
  title: "bun run dev",
  command: "bun run dev",
  status: "running" as const,
  isActive: false,
};

// Numberless rows, so what a row reads is its title alone.
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

describe("ManagePanel", () => {
  beforeEach(() => {
    openTerminal.mockClear();
    openOutputFile.mockClear();
    jobList = { pochi: [] };
    openState = { isTerminalClosed: false, canOpenOutputFile: false };
    isDevMode = false;
    backgroundTasks = [];
  });

  it("keeps the trigger bare when there is nothing running", () => {
    const { container } = renderPanel();

    const trigger = screen.getByTestId("manage-panel-toggle");
    // Icon only: no label, and no badge until something is actually running.
    expect(trigger.textContent).toBe("");
    expect(trigger.getAttribute("aria-label")).toBe("managePanel.toggle");
    expect(trigger.querySelector(".bg-blue-500")).toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(screen.getByText("managePanel.empty")).toBeDefined();
    expect(screen.queryByText("managePanel.pochiGroup")).toBeNull();
  });

  it("badges the trigger while a command is running", () => {
    jobList = { pochi: [runningJob] };

    const { container } = renderPanel();

    const trigger = screen.getByTestId("manage-panel-toggle");
    // The badge carries the running count itself.
    expect(trigger.textContent).toBe("1");
    expect(trigger.querySelector(".bg-blue-500")?.textContent).toBe("1");
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(screen.getByText("bun run dev")).toBeDefined();
    expect(screen.queryByText("managePanel.empty")).toBeNull();
  });

  it("drops the badge once every command has finished", () => {
    jobList = { pochi: [{ ...runningJob, status: "completed" }] };

    const { container } = renderPanel();

    expect(
      screen.getByTestId("manage-panel-toggle").querySelector(".bg-blue-500"),
    ).toBeNull();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("collapses a section from its title", () => {
    jobList = { pochi: [runningJob] };

    renderPanel();

    const title = screen.getByText("managePanel.pochiGroup");
    fireEvent.click(title);
    expect(screen.queryByText("bun run dev")).toBeNull();

    fireEvent.click(title);
    expect(screen.getByText("bun run dev")).toBeDefined();
  });

  it("holds a long category back behind a see-more toggle", () => {
    jobList = {
      pochi: Array.from({ length: 7 }, (_, index) => ({
        backgroundJobId: `bgjob-cmd-${index}`,
        displayId: `%${index}`,
        title: `bun run dev ${index}`,
        status: "completed" as const,
        isActive: false,
      })),
    };

    renderPanel();

    // Five rows, then the offer to see the other two.
    expect(screen.getByText("bun run dev 4")).toBeDefined();
    expect(screen.queryByText("bun run dev 5")).toBeNull();

    fireEvent.click(screen.getByText("managePanel.seeMore"));
    expect(screen.getByText("bun run dev 6")).toBeDefined();

    fireEvent.click(screen.getByText("managePanel.seeLess"));
    expect(screen.queryByText("bun run dev 5")).toBeNull();
  });

  it("explains a row by its command, and stays quiet without one", () => {
    jobList = {
      pochi: [
        runningJob,
        {
          ...runningJob,
          backgroundJobId: "bgjob-cmd-2",
          title: "bgjob-cmd-2",
          command: undefined,
        },
      ],
    };

    renderPanel();

    expect(screen.getByText("bun run dev").dataset.slot).toBe(
      "tooltip-trigger",
    );
    expect(screen.getByText("bgjob-cmd-2").dataset.slot).toBeUndefined();
  });

  it("says how a command ended on hover, exit code included", async () => {
    jobList = {
      pochi: [{ ...runningJob, status: "failed" as const, exitCode: 127 }],
    };

    renderPanel();

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
    jobList = { pochi: [runningJob] };

    renderPanel();

    const displayId = screen.getByText("%1");
    expect(displayId.tagName).toBe("SPAN");
    expect(displayId.closest("button")).toBeNull();
    // A running row has controls, so the number steps aside for them.
    expect(displayId.className).toContain("group-hover:opacity-0");
  });

  it("keeps the number for a row that has nothing to press", () => {
    jobList = { pochi: [{ ...runningJob, status: "stopped" as const }] };

    renderPanel();

    // Nothing comes to take its place, so it must not fade out either.
    expect(screen.getByText("%1").className).not.toContain(
      "group-hover:opacity-0",
    );
  });

  it("offers a running command its terminal and a way to stop it", () => {
    jobList = { pochi: [runningJob] };

    renderPanel();

    fireEvent.click(screen.getByLabelText("managePanel.openTerminal"));
    expect(openTerminal).toHaveBeenCalled();
    expect(screen.getByLabelText("managePanel.kill")).toBeDefined();
    expect(
      screen.queryByLabelText("backgroundJobNotifications.openOutput"),
    ).toBeNull();
  });

  it("hides the terminal control once the terminal is gone", () => {
    openState = { isTerminalClosed: true, canOpenOutputFile: false };
    jobList = { pochi: [runningJob] };

    renderPanel();

    expect(screen.queryByLabelText("managePanel.openTerminal")).toBeNull();
    // The process outlives its tab, so it can still be stopped.
    expect(screen.getByLabelText("managePanel.kill")).toBeDefined();
  });

  it("offers a finished command its output file", () => {
    jobList = {
      pochi: [
        {
          ...runningJob,
          status: "completed" as const,
          outputFile: "/tmp/bgjob-cmd-1.log",
        },
      ],
    };

    renderPanel();

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
    expect(openOutputFile).toHaveBeenCalled();
    expect(screen.queryByLabelText("managePanel.kill")).toBeNull();
    expect(screen.queryByLabelText("managePanel.openTerminal")).toBeNull();
  });

  it("leaves a finished command without a transcript with nothing to press", () => {
    jobList = { pochi: [{ ...runningJob, status: "stopped" as const }] };

    renderPanel();

    expect(
      screen.queryByLabelText("backgroundJobNotifications.openOutput"),
    ).toBeNull();
  });

  it("lists running commands first", () => {
    jobList = { pochi: [finishedRow, runningRow] };

    renderPanel();

    expect(rowTitles()).toEqual(["running", "done"]);
  });

  it("keeps a command in place once it stops", () => {
    jobList = { pochi: [finishedRow, runningRow] };

    const { rerender } = renderPanel();

    // Killing the top row must not drop it to the bottom under the pointer.
    jobList = {
      pochi: [finishedRow, { ...runningRow, status: "stopped" as const }],
    };
    rerender(<ManagePanel taskId="task-1" messages={[]} />);

    expect(rowTitles()).toEqual(["running", "done"]);
  });

  it("keeps background tasks out of the panel outside dev mode", () => {
    backgroundTasks = [{ id: "task-1", title: "A background task" }];

    renderPanel();

    expect(screen.queryByText("Background tasks")).toBeNull();
    expect(screen.getByText("managePanel.empty")).toBeDefined();
  });

  it("hides the task section in dev mode while there is no task", () => {
    isDevMode = true;

    renderPanel();

    expect(screen.queryByText("Background tasks")).toBeNull();
    expect(screen.getByText("managePanel.empty")).toBeDefined();
  });

  it("lists background tasks in dev mode", () => {
    isDevMode = true;
    backgroundTasks = [{ id: "task-1", title: "A background task" }];

    renderPanel();

    expect(screen.getByText("Background tasks")).toBeDefined();
    expect(screen.getByText("A background task")).toBeDefined();
    expect(screen.queryByText("managePanel.empty")).toBeNull();
  });

  it("takes the drawer to a task and back again", () => {
    isDevMode = true;
    backgroundTasks = [{ id: "task-1", title: "A background task" }];
    jobList = { pochi: [runningJob] };

    renderPanel();

    fireEvent.click(screen.getByText("A background task"));
    // The detail covers the list rather than replacing it.
    expect(screen.getByTestId("background-task-detail").textContent).toContain(
      "task-1",
    );
    expect(screen.getByTestId("background-task-layer").dataset.state).toBe(
      "open",
    );

    fireEvent.click(screen.getByText("back"));
    expect(screen.getByTestId("background-task-layer").dataset.state).toBe(
      "closed",
    );
  });

  it("keeps the list as it was left while a task is open", () => {
    isDevMode = true;
    backgroundTasks = [{ id: "task-1", title: "A background task" }];
    jobList = { pochi: [runningJob] };

    renderPanel();

    // Fold the commands, then take a detour through a task detail.
    fireEvent.click(screen.getByText("managePanel.pochiGroup"));
    expect(screen.queryByText("bun run dev")).toBeNull();

    fireEvent.click(screen.getByText("A background task"));
    fireEvent.click(screen.getByText("back"));

    // The list was never unmounted, so it is still folded.
    expect(screen.queryByText("bun run dev")).toBeNull();
  });
});
