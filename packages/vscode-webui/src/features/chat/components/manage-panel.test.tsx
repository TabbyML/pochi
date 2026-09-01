// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobList } from "../lib/build-job-list";
import { ManagePanel } from "./manage-panel";

const open = vi.fn();
let jobList: JobList = { pochi: [] };
let openState = { isTerminalClosed: false, canOpenOutputFile: false };

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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
    open,
  }),
}));

const renderPanel = () => render(<ManagePanel taskId="task-1" messages={[]} />);

const runningJob = {
  backgroundJobId: "bgjob-cmd-1",
  displayId: "%1",
  title: "bun run dev",
  command: "bun run dev",
  status: "running" as const,
  isActive: false,
};

describe("ManagePanel", () => {
  beforeEach(() => {
    open.mockClear();
    jobList = { pochi: [] };
    openState = { isTerminalClosed: false, canOpenOutputFile: false };
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
    // A dot, not a count: the number lives next to the section title.
    expect(trigger.textContent).toBe("");
    expect(trigger.querySelector(".bg-blue-500")).not.toBeNull();
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
      pochi: [runningJob, { ...runningJob, backgroundJobId: "bgjob-cmd-2" }],
    };
    jobList.pochi[1].command = undefined;

    renderPanel();

    const [withCommand, withoutCommand] = screen.getAllByLabelText(
      "commandExecutionPanel.openJob",
    );
    expect(withCommand.dataset.slot).toBe("tooltip-trigger");
    expect(withoutCommand.dataset.slot).toBeUndefined();
  });

  it("opens a job by clicking anywhere on its row", () => {
    jobList = { pochi: [runningJob] };

    renderPanel();

    const row = screen.getByLabelText("commandExecutionPanel.openJob");
    expect(row.tagName).toBe("BUTTON");
    fireEvent.click(screen.getByText("bun run dev"));
    expect(open).toHaveBeenCalled();
    expect(screen.getByText("%1")).toBeDefined();
  });

  it("drops the interaction once there is nothing left to open", () => {
    openState = { isTerminalClosed: true, canOpenOutputFile: false };
    jobList = { pochi: [{ ...runningJob, status: "stopped" }] };

    renderPanel();

    const row = screen.getByLabelText("commandExecutionPanel.terminalClosed");
    expect(row.tagName).not.toBe("BUTTON");
    fireEvent.click(screen.getByText("bun run dev"));
    expect(open).not.toHaveBeenCalled();
  });
});
