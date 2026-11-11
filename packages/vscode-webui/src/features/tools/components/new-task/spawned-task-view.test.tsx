// @vitest-environment jsdom
import { TooltipProvider } from "@/components/ui/tooltip";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolProps } from "../types";
import { SpawnedTaskView } from "./spawned-task-view";

const state = vi.hoisted(() => ({
  openTaskInPanel: vi.fn(),
}));

vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => true,
  vscodeHost: { openTaskInPanel: state.openTaskInPanel },
}));
vi.mock("@/lib/use-tasks", () => ({
  useTasks: () => [{ id: "task-1", cwd: "/repo", title: "History title" }],
}));
vi.mock("@/lib/hooks/use-pochi-credentials", () => ({
  usePochiCredentials: () => ({ jwt: null }),
}));
vi.mock("@getpochi/common/store-id-utils", () => ({
  encodeStoreId: (_jwt: unknown, id: string) => `store-${id}`,
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../tool-container", () => ({
  ExpandableToolContainer: ({ title }: { title: React.ReactNode }) => (
    <div>{title}</div>
  ),
}));
vi.mock("../status-icon", () => ({ StatusIcon: () => null }));

afterEach(() => {
  cleanup();
  state.openTaskInPanel.mockReset();
});

const startedTool = {
  type: "tool-newTask",
  toolCallId: "call-1",
  state: "output-available",
  input: {
    description: "Audit keyword matching",
    prompt: "Reply with exactly PONG",
    spawn: "task",
    _meta: { uid: "task-1" },
  },
  output: { result: "started" },
} as unknown as ToolProps<"newTask">["tool"];

function renderView() {
  return render(
    <TooltipProvider>
      <SpawnedTaskView tool={startedTool} isExecuting={false} />
    </TooltipProvider>,
  );
}

describe("SpawnedTaskView", () => {
  it("shows the description as plain text next to the Task label", () => {
    renderView();

    expect(screen.getByText("Task")).toBeTruthy();
    const link = screen.getByTestId("spawned-task-link");
    expect(link.textContent).toBe("Audit keyword matching");
    // No bordered chip or task icon: the label already marks it as a task.
    expect(link.querySelector(".border")).toBeNull();
    expect(link.querySelector("svg")).toBeNull();
  });

  it("opens the spawned task when the description is clicked", () => {
    renderView();

    fireEvent.click(screen.getByText("Audit keyword matching"));

    expect(state.openTaskInPanel).toHaveBeenCalledWith(
      {
        type: "open-task",
        cwd: "/repo",
        uid: "task-1",
        storeId: "store-task-1",
      },
      { showFileChanges: false },
    );
  });
});
