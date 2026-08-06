// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { BackgroundTasksChip } from "./background-tasks";

const task = {
  id: "task-1",
  title: "Background task",
  status: "pending-tool",
  parentId: "parent-1",
  updatedAt: new Date(),
  todos: [],
  error: null,
};

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/task-thread", () => ({
  TaskThread: ({
    className,
    messageListClassName,
    scrollAreaClassName,
    instantAutoScroll,
  }: {
    className?: string;
    messageListClassName?: string;
    scrollAreaClassName?: string;
    instantAutoScroll?: boolean;
  }) => (
    <div
      data-testid="task-thread"
      className={className}
      data-message-list-class-name={messageListClassName}
      data-scroll-area-class-name={scrollAreaClassName}
      data-instant-auto-scroll={instantAutoScroll}
    />
  ),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ComponentProps<"button">) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/hooks/use-navigate", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/features/settings", () => ({
  useIsDevMode: () => [false],
}));

vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => true,
  vscodeHost: {
    readBackgroundTaskState: async () => ({
      value: "serialized-signal",
      setBackgroundTaskState: async () => {},
    }),
  },
}));

vi.mock("@quilted/threads/signals", () => ({
  threadSignal: () => ({
    value: { useCase: "subagent", agentType: "researcher" },
  }),
}));

vi.mock("@getpochi/livekit", () => ({
  catalog: {
    queries: {
      backgroundTasks$: "backgroundTasks",
      makeTaskQuery: () => "task",
      makeMessagesQuery: () => "messages",
    },
  },
}));

vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({
    storeId: "store-1",
    useQuery: (query: string) => {
      if (query === "backgroundTasks") return [task];
      if (query === "task") return task;
      return [];
    },
  }),
}));

describe("BackgroundTasksChip", () => {
  it("lists subagent tasks with a stop action and opens the detail thread", async () => {
    const stopBackgroundTask = vi.fn().mockResolvedValue(undefined);
    render(<BackgroundTasksChip stopBackgroundTask={stopBackgroundTask} />);

    // The row appears once the task's background state resolves to subagent.
    const row = await screen.findByText("Background task");

    const stopButton = screen.getAllByTitle("backgroundTasks.stop")[0];
    fireEvent.click(stopButton);
    expect(stopBackgroundTask).toHaveBeenCalledWith("task-1");

    fireEvent.click(row);

    const taskThread = screen.getByTestId("task-thread");
    expect(taskThread.classList.contains("min-h-0")).toBe(true);
    expect(taskThread.classList.contains("flex-1")).toBe(true);
    expect(taskThread.dataset.messageListClassName).toBe(
      "mb-0 min-h-0 overflow-hidden px-0 py-0",
    );
    expect(taskThread.dataset.scrollAreaClassName).toBe(
      "m-0 h-full max-h-none rounded-none border-0",
    );
    expect(taskThread.dataset.instantAutoScroll).toBe("true");

    const detailBodyClasses = taskThread.parentElement?.classList;
    expect(detailBodyClasses?.contains("min-h-0")).toBe(true);
    expect(detailBodyClasses?.contains("flex-1")).toBe(true);
    expect(detailBodyClasses?.contains("overflow-hidden")).toBe(true);
  });
});
