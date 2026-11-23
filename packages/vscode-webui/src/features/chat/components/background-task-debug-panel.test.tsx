// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackgroundTaskDetail } from "./background-task-debug-panel";

const task = {
  id: "task-1",
  parentId: "parent-task-id",
  title: "Background task",
  status: "failed",
  updatedAt: new Date(),
  todos: [],
  error: { message: "A detailed failure message" },
};

let messageRows: Array<{ data: unknown }> = [];
let mockJobStatus: "running" | "completed" | "failed" | "stopped" | undefined;
let mockQueued = false;
const sendMessageMock = vi.hoisted(() => vi.fn());

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
  BackgroundJobManager: {
    forStore: () => ({
      forTask: (ownerTaskId: string) => ({
        sendMessage: (
          backgroundJobId: string,
          input: { message: string; interrupt?: boolean },
        ) => sendMessageMock(ownerTaskId, backgroundJobId, input),
      }),
    }),
  },
  catalog: {
    queries: {
      backgroundTasks$: "backgroundTasks",
      makeTaskQuery: () => "task",
      makeMessagesQuery: () => "messages",
    },
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
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
  render(<BackgroundTaskDetail taskId={task.id} onBack={() => {}} />);
}

function getDetailValue(label: string): string | null | undefined {
  return screen.getByText(label).parentElement?.lastElementChild?.textContent;
}

describe("BackgroundTaskDetail", () => {
  beforeEach(() => {
    messageRows = [];
    mockJobStatus = undefined;
    mockQueued = false;
    sendMessageMock.mockReset();
    sendMessageMock.mockResolvedValue({
      success: true,
      status: "resumed",
      backgroundJobId: "bgjob-task-task-1",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("focuses the back button when the detail opens", () => {
    const focus = vi.spyOn(HTMLElement.prototype, "focus");

    openTaskDetail();

    expect(document.activeElement).toBe(
      screen.getByLabelText("Back to the background job list"),
    );
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
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

    expect(getDetailValue("Cache Input Tokens")).toBe("0");
    expect(getDetailValue("Input Tokens")).toBe("12.3k");

    const statusRow = screen.getByText("Status").parentElement;
    const updatedRow = screen.getByText("Updated").parentElement;
    const cacheReadRow = screen.getByText("Cache Input Tokens").parentElement;
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

    expect(getDetailValue("Cache Input Tokens")).toBe("-");
    expect(getDetailValue("Input Tokens")).toBe("-");
  });

  it("hides the message input when backgroundJobId is omitted", () => {
    openTaskDetail();

    expect(screen.queryByTestId("background-task-message-input")).toBeNull();
  });

  it("sends a follow-up message from the input box and clears the draft", async () => {
    render(
      <BackgroundTaskDetail
        taskId={task.id}
        backgroundJobId="bgjob-task-task-1"
        onBack={() => {}}
      />,
    );

    const input = screen.getByTestId(
      "background-task-message-input",
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "  Please check tests  " } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        "parent-task-id",
        "bgjob-task-task-1",
        { message: "Please check tests", interrupt: false },
      );
    });
    expect(input.value).toBe("");
    expect(screen.queryByLabelText("backgroundTasks.steerMessage")).toBeNull();
  });

  it("shows interrupt & send when running and forwards interrupt: true", async () => {
    mockJobStatus = "running";
    mockQueued = false;

    render(
      <BackgroundTaskDetail
        taskId={task.id}
        backgroundJobId="bgjob-task-task-1"
        onBack={() => {}}
      />,
    );

    const input = screen.getByTestId(
      "background-task-message-input",
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Stop and pivot" } });
    fireEvent.click(screen.getByLabelText("backgroundTasks.steerMessage"));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith(
        "parent-task-id",
        "bgjob-task-task-1",
        { message: "Stop and pivot", interrupt: true },
      );
    });
    expect(input.value).toBe("");
  });

  it("displays an error alert and preserves the draft when sending fails", async () => {
    sendMessageMock.mockRejectedValueOnce(new Error("Subagent not found"));

    render(
      <BackgroundTaskDetail
        taskId={task.id}
        backgroundJobId="bgjob-task-task-1"
        onBack={() => {}}
      />,
    );

    const input = screen.getByTestId(
      "background-task-message-input",
    ) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: "Retry this" } });
    fireEvent.click(screen.getByLabelText("backgroundTasks.sendMessage"));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Subagent not found");
    });
    expect(input.value).toBe("Retry this");
  });
});

vi.mock("../hooks/use-background-job-list", () => ({
  useBackgroundTaskStatus: () => mockJobStatus,
  useBackgroundTaskQueued: () => mockQueued,
}));
