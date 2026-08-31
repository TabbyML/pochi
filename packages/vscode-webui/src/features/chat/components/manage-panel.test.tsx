// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobList } from "../lib/build-job-list";
import { ManagePanel } from "./manage-panel";

const open = vi.fn();
let jobList: JobList = { pochi: [], terminals: [] };
let isDevMode = false;
let openState = { isTerminalClosed: false, canOpenOutputFile: false };

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

// The popover is rendered inline so the content is always assertable; opening
// and closing it is Radix's responsibility, not this component's.
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/features/settings", () => ({
  useIsDevMode: () => [isDevMode],
}));

vi.mock("../hooks/use-job-list", () => ({
  useJobList: () => jobList,
}));

vi.mock("@/lib/hooks/use-open-background-job", () => ({
  useOpenBackgroundJob: () => ({
    liveTerminal: undefined,
    ...openState,
    open,
  }),
}));

vi.mock("./background-task-debug-panel", () => ({
  BackgroundTaskList: () => <div data-testid="background-task-list" />,
  BackgroundTaskDetail: () => null,
}));

const renderPanel = () => render(<ManagePanel taskId="task-1" messages={[]} />);

describe("ManagePanel", () => {
  beforeEach(() => {
    open.mockClear();
    isDevMode = false;
    jobList = { pochi: [], terminals: [] };
    openState = { isTerminalClosed: false, canOpenOutputFile: false };
  });

  it("keeps the chip bare when there is nothing to manage", () => {
    const { container } = renderPanel();

    const chip = screen.getByTestId("manage-panel-toggle");
    // Icon only: no label, and no badge until something is actually running.
    expect(chip.textContent).toBe("");
    expect(chip.getAttribute("aria-label")).toBe("managePanel.toggle");
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(screen.getByText("managePanel.empty")).toBeDefined();
    expect(screen.queryByText("managePanel.pochiGroup")).toBeNull();
    expect(screen.queryByText("managePanel.terminalsGroup")).toBeNull();
  });

  it("hides a category that has nothing in it", () => {
    jobList = {
      pochi: [],
      terminals: [
        {
          backgroundJobId: "term-1",
          title: "zsh",
          status: "idle",
          isActive: true,
        },
      ],
    };

    renderPanel();

    expect(screen.getByText("managePanel.terminalsGroup")).toBeDefined();
    expect(screen.queryByText("managePanel.pochiGroup")).toBeNull();
    expect(screen.queryByText("managePanel.empty")).toBeNull();
  });

  it("badges the running rows only, not everything listed", () => {
    jobList = {
      pochi: [
        {
          backgroundJobId: "bgjob-cmd-1",
          displayId: "%1",
          title: "bun run dev",
          command: "bun run dev",
          status: "running",
          isActive: false,
        },
      ],
      terminals: [
        {
          backgroundJobId: "term-1",
          title: "zsh",
          status: "idle",
          isActive: true,
        },
      ],
    };

    const { container } = renderPanel();

    // Two rows are listed, but only one of them is working.
    expect(screen.getByTestId("manage-panel-toggle").textContent).toBe("1");
    expect(container.querySelector(".animate-spin")).not.toBeNull();
    expect(screen.getByText("bun run dev")).toBeDefined();
    expect(screen.getByText("zsh")).toBeDefined();
  });

  it("drops the badge when an open terminal is merely idle", () => {
    jobList = {
      pochi: [],
      terminals: [
        {
          backgroundJobId: "term-1",
          title: "zsh",
          status: "idle",
          isActive: true,
        },
      ],
    };

    const { container } = renderPanel();

    expect(screen.getByTestId("manage-panel-toggle").textContent).toBe("");
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  it("labels a terminal that has not reported a name yet", () => {
    jobList = {
      pochi: [],
      terminals: [
        {
          backgroundJobId: "term-1",
          title: "",
          status: "idle",
          isActive: true,
        },
      ],
    };

    renderPanel();

    expect(
      screen.getByText("commandExecutionPanel.userTerminal"),
    ).toBeDefined();
  });

  it("collapses a section from its title", () => {
    jobList = {
      pochi: [],
      terminals: [
        {
          backgroundJobId: "term-1",
          title: "zsh",
          status: "idle",
          isActive: true,
        },
      ],
    };

    renderPanel();

    const title = screen.getByText("managePanel.terminalsGroup");
    fireEvent.click(title);
    expect(screen.queryByText("zsh")).toBeNull();

    fireEvent.click(title);
    expect(screen.getByText("zsh")).toBeDefined();
  });

  it("holds a long category back behind a see-more toggle", () => {
    jobList = {
      pochi: [],
      terminals: Array.from({ length: 7 }, (_, index) => ({
        backgroundJobId: `term-${index}`,
        title: `zsh ${index}`,
        status: "idle" as const,
        isActive: false,
      })),
    };

    renderPanel();

    // Five rows, then the offer to see the other two.
    expect(screen.getByText("zsh 4")).toBeDefined();
    expect(screen.queryByText("zsh 5")).toBeNull();

    fireEvent.click(screen.getByText("managePanel.seeMore"));
    expect(screen.getByText("zsh 6")).toBeDefined();

    fireEvent.click(screen.getByText("managePanel.seeLess"));
    expect(screen.queryByText("zsh 5")).toBeNull();
  });

  it("explains a row by its command, and stays quiet without one", () => {
    jobList = {
      pochi: [
        {
          backgroundJobId: "bgjob-cmd-1",
          displayId: "%1",
          title: "bun run dev",
          command: "bun run dev",
          status: "running",
          isActive: false,
        },
      ],
      terminals: [
        {
          backgroundJobId: "term-1",
          title: "zsh",
          status: "idle",
          isActive: true,
        },
      ],
    };

    renderPanel();

    const jobRow = screen.getByLabelText("commandExecutionPanel.openJob");
    expect(jobRow.dataset.slot).toBe("tooltip-trigger");
    const terminalRow = screen.getByLabelText(
      "commandExecutionPanel.openTerminal",
    );
    expect(terminalRow.dataset.slot).toBeUndefined();
  });

  it("opens a job by clicking anywhere on its row", () => {
    jobList = {
      pochi: [
        {
          backgroundJobId: "bgjob-cmd-1",
          displayId: "%1",
          title: "bun run dev",
          status: "running",
          isActive: false,
        },
      ],
      terminals: [],
    };

    renderPanel();

    const row = screen.getByLabelText("commandExecutionPanel.openJob");
    expect(row.tagName).toBe("BUTTON");
    fireEvent.click(screen.getByText("bun run dev"));
    expect(open).toHaveBeenCalled();
    expect(screen.getByText("%1")).toBeDefined();
  });

  it("drops the interaction once there is nothing left to open", () => {
    openState = { isTerminalClosed: true, canOpenOutputFile: false };
    jobList = {
      pochi: [],
      terminals: [
        {
          backgroundJobId: "term-1",
          title: "zsh",
          status: "stopped",
          isActive: false,
        },
      ],
    };

    renderPanel();

    const row = screen.getByLabelText("commandExecutionPanel.terminalClosed");
    expect(row.tagName).not.toBe("BUTTON");
    fireEvent.click(screen.getByText("zsh"));
    expect(open).not.toHaveBeenCalled();
  });

  it("shows the background task category only in dev mode", () => {
    renderPanel();
    expect(screen.queryByTestId("background-task-list")).toBeNull();

    isDevMode = true;
    renderPanel();
    expect(screen.getAllByTestId("background-task-list")).toHaveLength(1);
  });
});
