// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { BackgroundTaskDebugPanel } from "./background-task-debug-panel";

const task = {
  id: "task-1",
  title: "Background task",
  status: "failed",
  updatedAt: new Date(),
  todos: [],
  error: { message: "A detailed failure message" },
};

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

vi.mock("@/components/ui/hover-card", () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/features/settings", () => ({
  useIsDevMode: () => [true],
}));

vi.mock("@/lib/hooks/use-background-task-state", () => ({
  useBackgroundTaskState: () => ({
    backgroundTaskState: {
      useCase: "explore",
      parentTaskId: "parent-task-id",
      tools: ["readFile"],
    },
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
    useQuery: (query: string) => {
      if (query === "backgroundTasks") return [task];
      if (query === "task") return task;
      return [];
    },
  }),
}));

describe("BackgroundTaskDebugPanel", () => {
  it("uses a single borderless scroll area that fills the remaining height", () => {
    render(<BackgroundTaskDebugPanel />);

    fireEvent.click(screen.getByText("Background task"));

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
    expect(detailBodyClasses?.contains("flex")).toBe(true);
    expect(detailBodyClasses?.contains("min-h-0")).toBe(true);
    expect(detailBodyClasses?.contains("flex-1")).toBe(true);
    expect(detailBodyClasses?.contains("flex-col")).toBe(true);
    expect(detailBodyClasses?.contains("overflow-hidden")).toBe(true);
    expect(taskThread.dataset.scrollAreaClassName).not.toContain("100vh");
  });
});
