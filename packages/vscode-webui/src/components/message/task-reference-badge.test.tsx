import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TaskReferenceBadge } from "./task-reference-badge";

const { openTaskInPanel, tasks } = vi.hoisted(() => ({
  openTaskInPanel: vi.fn(),
  tasks: [] as {
    id: string;
    title?: string;
    cwd?: string;
    parentId?: string;
  }[],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/vscode", () => ({ vscodeHost: { openTaskInPanel } }));
vi.mock("@/lib/use-tasks", () => ({ useTasks: () => tasks }));
vi.mock("@/lib/hooks/use-pochi-credentials", () => ({
  usePochiCredentials: () => ({ jwt: null }),
}));
vi.mock("@getpochi/common/store-id-utils", () => ({
  encodeStoreId: (_jwt: unknown, id: string) => `store-${id}`,
}));
vi.mock("./task-reference-context", () => ({
  useMentionedTaskTitle: () => undefined,
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TooltipContent: () => null,
}));

describe("TaskReferenceBadge", () => {
  beforeEach(() => {
    openTaskInPanel.mockClear();
    tasks.length = 0;
  });

  it("opens the task in a panel by default", () => {
    tasks.push({ id: "task-1", title: "My task", cwd: "/repo" });
    render(<TaskReferenceBadge id="task-1" />);

    fireEvent.click(screen.getByText("My task"));

    expect(openTaskInPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "open-task",
        cwd: "/repo",
        uid: "task-1",
      }),
    );
  });

  it("runs onClick instead of opening the task when given", () => {
    tasks.push({ id: "task-1", title: "My task", cwd: "/repo" });
    const onClick = vi.fn();
    render(<TaskReferenceBadge id="task-1" onClick={onClick} />);

    fireEvent.click(screen.getByText("My task"));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(openTaskInPanel).not.toHaveBeenCalled();
  });

  it("is clickable with onClick even when the task is not in history", () => {
    const onClick = vi.fn();
    render(
      <TaskReferenceBadge id="unknown" title="CLI task" onClick={onClick} />,
    );

    fireEvent.click(screen.getByText("CLI task"));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
