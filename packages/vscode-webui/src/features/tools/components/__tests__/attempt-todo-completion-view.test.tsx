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
      footerTaskThreadLabel,
      headerContent,
      showTaskThread,
    }: {
      children: ReactNode;
      footerTaskThreadLabel?: ReactNode;
      headerContent?: ReactNode;
      statusIconVariant?: string;
      showTaskThread?: boolean;
    }) => (
      <div data-show-task-thread={String(showTaskThread)}>
        {headerContent}
        {footerTaskThreadLabel}
        {children}
      </div>
    ),
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

function makeCompletedAttemptTodoCompletionTool(result: unknown) {
  return {
    type: "tool-newTask",
    toolCallId: "attempt-todo-completion",
    state: "output-available",
    input: {
      agentType: "attemptTodoCompletion",
      description: "Audit todo completion",
    },
    output: {
      result,
    },
  } as never;
}

function makeErroredAttemptTodoCompletionTool(error: string) {
  return {
    type: "tool-newTask",
    toolCallId: "attempt-todo-completion",
    state: "output-available",
    input: {
      agentType: "attemptTodoCompletion",
      description: "Audit todo completion",
    },
    output: {
      error,
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

  it("renders a needs-work title after an unresolved audit stops", () => {
    render(
      <AttemptTodoCompletionView
        uid="attempt-uid"
        tool={makeCompletedAttemptTodoCompletionTool({
          summary: "More work remains.",
          todos: [
            {
              id: "todo-1",
              content: "Add one test",
              status: "in-progress",
              priority: "medium",
            },
          ],
        })}
        isExecuting={false}
        isLoading={false}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(screen.getByText("More work remains.")).toBeTruthy();
    expect(
      screen.getByText("attemptTodoCompletionView.needsWork"),
    ).toBeTruthy();
  });

  it("renders a needs-work title after an unresolved audit stops while chat is still loading", () => {
    render(
      <AttemptTodoCompletionView
        uid="attempt-uid"
        tool={makeCompletedAttemptTodoCompletionTool({
          summary: "More work remains.",
          todos: [
            {
              id: "todo-1",
              content: "Add one test",
              status: "in-progress",
              priority: "medium",
            },
          ],
        })}
        isExecuting={false}
        isLoading={true}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(
      screen.getByText("attemptTodoCompletionView.needsWork"),
    ).toBeTruthy();
  });

  it("renders a completed title for resolved audit results", () => {
    render(
      <AttemptTodoCompletionView
        uid="attempt-uid"
        tool={makeCompletedAttemptTodoCompletionTool(
          JSON.stringify({
            summary: "All todos are complete.",
            todos: [
              {
                id: "todo-1",
                content: "Add one test",
                status: "completed",
                priority: "medium",
              },
            ],
          }),
        )}
        isExecuting={false}
        isLoading={false}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(screen.getByText("All todos are complete.")).toBeTruthy();
    expect(
      screen.getByText("attemptTodoCompletionView.completed"),
    ).toBeTruthy();
  });

  it("renders a stopped title with a neutral status icon after user cancellation", () => {
    render(
      <AttemptTodoCompletionView
        uid="attempt-uid"
        tool={makeErroredAttemptTodoCompletionTool(
          "User aborted the tool call",
        )}
        isExecuting={false}
        isLoading={false}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(screen.getByText("attemptTodoCompletionView.stopped")).toBeTruthy();
    expect(
      screen.getByText("attemptTodoCompletionView.stoppedDescription"),
    ).toBeTruthy();
    expect(
      screen.getByText("attemptTodoCompletionView.auditDetails"),
    ).toBeTruthy();
    expect(screen.queryByText("attemptTodoCompletionView.failed")).toBeNull();
    expect(subAgentViewMock.mock.calls[0]?.[0]).toMatchObject({
      statusIconVariant: "muted",
      footerTaskThreadLabel: "attemptTodoCompletionView.auditDetails",
    });
  });

  it("renders a failure title for malformed audit results", () => {
    render(
      <AttemptTodoCompletionView
        uid="attempt-uid"
        tool={makeCompletedAttemptTodoCompletionTool("not valid audit output")}
        isExecuting={false}
        isLoading={false}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(screen.getByText("attemptTodoCompletionView.failed")).toBeTruthy();
    expect(
      screen.getByText("attemptTodoCompletionView.failedDescription"),
    ).toBeTruthy();
    expect(
      screen.getByText("attemptTodoCompletionView.auditDetails"),
    ).toBeTruthy();
  });

  it("keeps the auditing title while the audit is still executing", () => {
    render(
      <AttemptTodoCompletionView
        uid="attempt-uid"
        tool={makeCompletedAttemptTodoCompletionTool({
          summary: "More work remains.",
          todos: [
            {
              id: "todo-1",
              content: "Add one test",
              status: "in-progress",
              priority: "medium",
            },
          ],
        })}
        isExecuting={true}
        isLoading={false}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(screen.getByText("attemptTodoCompletionView.auditing")).toBeTruthy();
    expect(
      screen.queryByText("attemptTodoCompletionView.needsWork"),
    ).toBeNull();
  });
});
