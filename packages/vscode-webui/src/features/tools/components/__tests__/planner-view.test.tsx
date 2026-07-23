// @vitest-environment jsdom
import type { TaskThreadSource } from "@/components/task-thread";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlannerView } from "../new-task/planner-view";

const subAgentViewMock = vi.hoisted(() =>
  vi.fn(
    ({
      children,
      showTaskThread,
    }: {
      children: ReactNode;
      showTaskThread?: boolean;
    }) => <div data-show-task-thread={String(showTaskThread)}>{children}</div>,
  ),
);

const useStoreFileMock = vi.hoisted(() => vi.fn());

vi.mock("../new-task/sub-agent-view", () => ({
  SubAgentView: subAgentViewMock,
}));

vi.mock("@/components/files-provider", () => ({
  useStoreFile: useStoreFileMock,
}));

vi.mock("@/components/message", () => ({
  MessageMarkdown: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/task-thread", () => ({
  TaskThread: () => <div data-testid="task-thread" />,
}));

vi.mock("@/features/chat", () => ({
  FixedStateChatContextProvider: ({
    children,
  }: {
    children: ReactNode;
  }) => <>{children}</>,
  useSendRetry: () => vi.fn(),
}));

vi.mock("@/lib/hooks/use-navigate", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/hooks/use-review-plan-tutorial-counter", () => ({
  useReviewPlanTutorialCounter: () => ({
    count: 0,
    incrementCount: vi.fn(),
  }),
}));

vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({
    storeId: "store-id",
  }),
}));

vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => false,
  vscodeHost: {
    openFile: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const taskSource: TaskThreadSource = {
  messages: [
    {
      id: "user-message",
      role: "user",
      parts: [{ type: "text", text: "Run the subtask" }],
    },
    {
      id: "assistant-message",
      role: "assistant",
      parts: [{ type: "text", text: "Working on it" }],
    },
  ],
  todos: [],
};

const plannerTool = {
  type: "tool-newTask",
  toolCallId: "planner-call",
  state: "input-available",
  input: {
    agentType: "planner",
    description: "Create a plan",
  },
} as never;

function lastSubAgentProps() {
  return subAgentViewMock.mock.calls.at(-1)?.[0];
}

describe("PlannerView", () => {
  beforeEach(() => {
    subAgentViewMock.mockClear();
    useStoreFileMock.mockReset();
  });

  it("keeps the trajectory in the card body until a plan exists", () => {
    useStoreFileMock.mockReturnValue(undefined);

    render(
      <PlannerView
        uid="planner-uid"
        tool={plannerTool}
        isExecuting={true}
        isLoading={false}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(screen.getByTestId("task-thread")).toBeTruthy();
    expect(lastSubAgentProps()).toMatchObject({
      showTaskThread: false,
    });
  });

  it("shows the trajectory in the footer when a plan is in the card body", () => {
    useStoreFileMock.mockReturnValue({ content: "# Plan" });

    render(
      <PlannerView
        uid="planner-uid"
        tool={plannerTool}
        isExecuting={false}
        isLoading={false}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(screen.getByText("# Plan")).toBeTruthy();
    expect(lastSubAgentProps()).toMatchObject({
      showTaskThread: true,
    });
  });
});
