// @vitest-environment jsdom
import type { TaskThreadSource } from "@/components/task-thread";
import { getToolCallErrorMessage } from "@/lib/tool-call-error";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AttemptTodoCompletionView } from "../new-task/attempt-todo-completion-view";

const subAgentViewMock = vi.hoisted(() =>
  vi.fn(
    ({
      children,
      headerContent,
      showTaskThread,
    }: {
      children: ReactNode;
      headerContent?: ReactNode;
      showTaskThread?: boolean;
    }) => (
      <div data-show-task-thread={String(showTaskThread)}>
        {headerContent}
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

function makeCompletedAndErroredAttemptTodoCompletionTool(
  result: unknown,
  error: string,
) {
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

const emptyTaskSource: TaskThreadSource = {
  messages: [],
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

  it("keeps the audit thread inline after the audit stops without a summary", () => {
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

    expect(screen.getByTestId("task-thread")).toBeTruthy();
    expect(subAgentViewMock.mock.calls[0]?.[0]).toMatchObject({
      showTaskThread: false,
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

  it("renders a stopped title with an error status icon after user cancellation", () => {
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
    expect(screen.getByTestId("task-thread")).toBeTruthy();
    expect(
      screen.queryByText("attemptTodoCompletionView.stoppedDescription"),
    ).toBeNull();
    expect(
      screen.queryByText("attemptTodoCompletionView.unavailable"),
    ).toBeNull();
    expect(subAgentViewMock.mock.calls[0]?.[0]).toMatchObject({
      showTaskThread: false,
    });
  });

  it("keeps stopped audit content in the card body after user cancellation while still executing", () => {
    render(
      <AttemptTodoCompletionView
        uid="attempt-uid"
        tool={makeErroredAttemptTodoCompletionTool(
          "User aborted the tool call",
        )}
        isExecuting={true}
        isLoading={true}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(
      screen.getByText("attemptTodoCompletionView.stopped").className,
    ).not.toContain("animated-gradient-text");
    expect(screen.getByTestId("task-thread")).toBeTruthy();
    expect(
      screen.queryByText("attemptTodoCompletionView.stoppedDescription"),
    ).toBeNull();
    expect(subAgentViewMock.mock.calls[0]?.[0]).toMatchObject({
      showTaskThread: false,
    });
  });

  it("renders a padded stopped fallback when cancellation has no thread messages", () => {
    render(
      <AttemptTodoCompletionView
        uid="attempt-uid"
        tool={makeErroredAttemptTodoCompletionTool(
          "User aborted the tool call",
        )}
        isExecuting={true}
        isLoading={true}
        messages={[]}
        taskSource={emptyTaskSource}
      />,
    );

    const fallback = screen.getByText(
      "attemptTodoCompletionView.stoppedDescription",
    );
    expect(fallback.className).toContain("px-4");
    expect(fallback.className).toContain("py-3");
    expect(screen.queryByTestId("task-thread")).toBeNull();
    expect(subAgentViewMock.mock.calls[0]?.[0]).toMatchObject({
      showTaskThread: false,
    });
  });

  it("renders a tool result summary before cancellation fallback text", () => {
    render(
      <AttemptTodoCompletionView
        uid="attempt-uid"
        tool={makeCompletedAndErroredAttemptTodoCompletionTool(
          {
            summary: "The audit produced a summary before cancellation.",
            todos: [
              {
                id: "todo-1",
                content: "Add one test",
                status: "completed",
                priority: "medium",
              },
            ],
          },
          "User aborted the tool call",
        )}
        isExecuting={true}
        isLoading={true}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(
      screen.getByText("The audit produced a summary before cancellation."),
    ).toBeTruthy();
    expect(
      screen.queryByText("attemptTodoCompletionView.stoppedDescription"),
    ).toBeNull();
    expect(screen.queryByTestId("task-thread")).toBeNull();
    expect(subAgentViewMock.mock.calls[0]?.[0]).toMatchObject({
      showTaskThread: true,
    });
  });

  it("renders a stopped title after cancellation caused by a previous tool failure", () => {
    render(
      <AttemptTodoCompletionView
        uid="attempt-uid"
        tool={makeErroredAttemptTodoCompletionTool(
          getToolCallErrorMessage("previous-tool-call-failed"),
        )}
        isExecuting={false}
        isLoading={false}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(screen.getByText("attemptTodoCompletionView.stopped")).toBeTruthy();
    expect(
      screen.queryByText("attemptTodoCompletionView.unavailable"),
    ).toBeNull();
  });

  it("keeps the audit thread inline for malformed audit results with messages", () => {
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

    expect(
      screen.getByText("attemptTodoCompletionView.unavailable"),
    ).toBeTruthy();
    expect(screen.getByTestId("task-thread")).toBeTruthy();
    expect(
      screen.queryByText("attemptTodoCompletionView.unavailableDescription"),
    ).toBeNull();
    expect(subAgentViewMock.mock.calls[0]?.[0]).toMatchObject({
      showTaskThread: false,
    });
  });

  it("renders a padded unavailable fallback for malformed audit results without thread messages", () => {
    render(
      <AttemptTodoCompletionView
        uid="attempt-uid"
        tool={makeCompletedAttemptTodoCompletionTool("not valid audit output")}
        isExecuting={false}
        isLoading={false}
        messages={[]}
        taskSource={emptyTaskSource}
      />,
    );

    expect(
      screen.getByText("attemptTodoCompletionView.unavailable"),
    ).toBeTruthy();
    const fallback = screen.getByText(
      "attemptTodoCompletionView.unavailableDescription",
    );
    expect(fallback.className).toContain("px-4");
    expect(fallback.className).toContain("py-3");
    expect(
      screen.queryByText("attemptTodoCompletionView.stoppedDescription"),
    ).toBeNull();
    expect(screen.queryByTestId("task-thread")).toBeNull();
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
