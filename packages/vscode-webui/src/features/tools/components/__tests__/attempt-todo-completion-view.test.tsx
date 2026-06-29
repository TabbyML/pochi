// @vitest-environment jsdom
import type { TaskThreadSource } from "@/components/task-thread";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttemptTodoCompletionView } from "../new-task/attempt-todo-completion-view";

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

vi.mock("../new-task/sub-agent-view", () => ({
  SubAgentView: subAgentViewMock,
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
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => false,
}));

function makeAttemptTodoCompletionTool() {
  return {
    type: "tool-newTask",
    toolCallId: "attempt-todo-completion",
    state: "input-available",
    input: {
      agentType: "attemptTodoCompletion",
      description: "Audit todo completion",
    },
  } as never;
}

const taskSource: TaskThreadSource = {
  messages: [
    {
      id: "user-message",
      role: "user",
      parts: [{ type: "text", text: "Check the todo" }],
    },
    {
      id: "assistant-message",
      role: "assistant",
      parts: [{ type: "text", text: "Still checking" }],
    },
  ],
  todos: [],
};

describe("AttemptTodoCompletionView", () => {
  beforeEach(() => {
    subAgentViewMock.mockClear();
  });

  it("renders the subagent thread inline while the audit is running", () => {
    render(
      <AttemptTodoCompletionView
        uid="attempt-uid"
        tool={makeAttemptTodoCompletionTool()}
        isExecuting={true}
        isLoading={false}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(screen.getByTestId("task-thread")).toBeTruthy();
    expect(subAgentViewMock.mock.calls[0]?.[0]).toMatchObject({
      showTaskThread: false,
      showToolCall: false,
    });
  });

  it("enables the footer thread drawer after the audit stops running", () => {
    render(
      <AttemptTodoCompletionView
        uid="attempt-uid"
        tool={makeAttemptTodoCompletionTool()}
        isExecuting={false}
        isLoading={false}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(screen.queryByTestId("task-thread")).toBeNull();
    expect(subAgentViewMock.mock.calls[0]?.[0]).toMatchObject({
      showTaskThread: true,
    });
  });
});
