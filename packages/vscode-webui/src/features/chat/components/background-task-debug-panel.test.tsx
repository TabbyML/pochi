// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundTaskDebugPanel } from "./background-task-debug-panel";

const task = {
  id: "task-1",
  title: "Background task",
  status: "failed",
  updatedAt: new Date(),
  todos: [],
  error: { message: "A detailed failure message" },
};

let messageRows: Array<{ data: unknown }> = [];

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
      if (query === "messages") return messageRows;
      return [];
    },
  }),
}));

function openTaskDetail() {
  render(<BackgroundTaskDebugPanel />);
  fireEvent.click(screen.getByText("Background task"));
}

function getDetailValue(label: string): string | null | undefined {
  return screen.getByText(label).parentElement?.lastElementChild?.textContent;
}

describe("BackgroundTaskDebugPanel", () => {
  beforeEach(() => {
    messageRows = [];
  });

  it("uses a single borderless scroll area that fills the remaining height", () => {
    openTaskDetail();

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

  it("shows formatted token usage from the latest assistant request", () => {
    messageRows = [
      {
        data: {
          id: "assistant-1",
          role: "assistant",
          metadata: {
            kind: "assistant",
            totalTokens: 1_500,
            cacheReadTokens: 800,
            inputTokens: 700,
          },
          parts: [],
        },
      },
      {
        data: {
          id: "user-1",
          role: "user",
          metadata: { kind: "user" },
          parts: [],
        },
      },
      {
        data: {
          id: "assistant-2",
          role: "assistant",
          metadata: {
            kind: "assistant",
            totalTokens: 12_345,
            cacheReadTokens: 0,
            inputTokens: 12_345,
          },
          parts: [],
        },
      },
    ];

    openTaskDetail();

    expect(getDetailValue("Cache Read Tokens")).toBe("0");
    expect(getDetailValue("Input Tokens")).toBe("12.3k");

    const statusRow = screen.getByText("Status").parentElement;
    const updatedRow = screen.getByText("Updated").parentElement;
    const cacheReadRow = screen.getByText("Cache Read Tokens").parentElement;
    const inputRow = screen.getByText("Input Tokens").parentElement;
    expect(statusRow?.nextElementSibling).toBe(updatedRow);
    expect(updatedRow?.nextElementSibling).toBe(cacheReadRow);
    expect(cacheReadRow?.nextElementSibling).toBe(inputRow);
  });

  it("shows a dash when the latest assistant request has no detailed usage", () => {
    messageRows = [
      {
        data: {
          id: "assistant-1",
          role: "assistant",
          metadata: {
            kind: "assistant",
            totalTokens: 100,
          },
          parts: [],
        },
      },
    ];

    openTaskDetail();

    expect(getDetailValue("Cache Read Tokens")).toBe("-");
    expect(getDetailValue("Input Tokens")).toBe("-");
  });
});
