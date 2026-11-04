// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SubAgentView } from "../new-task/sub-agent-view";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  isVSCode: false,
}));

vi.mock("@/components/task-thread", () => ({
  TaskThread: () => <div />,
}));

vi.mock("@/features/chat", () => ({
  FixedStateChatContextProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
  BackgroundTaskButton: ({
    taskId,
    children,
  }: { taskId: string; children: ReactNode }) => (
    <button type="button" data-testid={`background-task-${taskId}`}>
      {children}
    </button>
  ),
}));

vi.mock("../tool-call-lite", () => ({
  ToolCallLite: ({ tools }: { tools: { toolCallId: string }[] }) => (
    <span>{tools[0].toolCallId}</span>
  ),
}));

vi.mock("@/lib/hooks/use-navigate", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({ storeId: "store-id" }),
}));

vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => mocks.isVSCode,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../status-icon", () => ({
  StatusIcon: () => <span />,
}));

const browserTool = {
  type: "tool-newTask",
  toolCallId: "browser-call",
  state: "input-available",
  input: {
    agentType: "browser",
    description: "Use the browser",
  },
} as never;

const taskSource = { messages: [], todos: [], parentId: "parent" };

describe("SubAgentView", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.isVSCode = false;
  });

  it("does not render a separator below a header-only card", () => {
    const { container } = render(
      <SubAgentView
        uid="browser-uid"
        tool={browserTool}
        isExecuting={false}
        taskSource={undefined}
      >
        {null}
      </SubAgentView>,
    );

    const header = container.firstElementChild?.firstElementChild;
    expect(header?.className).not.toContain("border-b");
  });

  it("renders a separator when the card has a body", () => {
    const { container } = render(
      <SubAgentView
        uid="browser-uid"
        tool={browserTool}
        isExecuting={true}
        taskSource={undefined}
      >
        <div>Browser content</div>
      </SubAgentView>,
    );

    const header = container.firstElementChild?.firstElementChild;
    expect(header?.className).toContain("border-b");
  });

  it("shows the newest browser command as soon as the task messages change", () => {
    const card = (toolCallId: string) => (
      <SubAgentView
        tool={browserTool}
        isExecuting={true}
        showToolCall={true}
        taskSource={{
          todos: [],
          messages: [
            { id: "prompt", role: "user", parts: [] },
            {
              id: "step",
              role: "assistant",
              parts: [
                {
                  type: "tool-executeCommand",
                  state: "input-available",
                  toolCallId,
                  input: { command: "agent-browser snapshot" },
                },
              ],
            },
          ],
        }}
      >
        {null}
      </SubAgentView>
    );
    const { rerender } = render(card("first-command"));
    expect(screen.getByText("first-command")).toBeTruthy();
    rerender(card("second-command"));
    expect(screen.getByText("second-command")).toBeTruthy();
    expect(screen.queryByText("first-command")).toBeNull();
  });

  it("opens a foreground subtask by navigating to it", () => {
    mocks.isVSCode = true;
    render(
      <SubAgentView
        uid="browser-uid"
        tool={browserTool}
        isExecuting={true}
        taskSource={taskSource}
      >
        {null}
      </SubAgentView>,
    );

    expect(screen.queryByText("backgroundTasks.background")).toBeNull();
    fireEvent.click(screen.getByText("Use the browser"));
    expect(mocks.navigate).toHaveBeenCalled();
  });

  it("marks a background subtask and inspects it without navigating", () => {
    mocks.isVSCode = true;
    render(
      <SubAgentView
        uid="browser-uid"
        tool={browserTool}
        isExecuting={true}
        taskSource={taskSource}
        isBackground={true}
      >
        {null}
      </SubAgentView>,
    );

    expect(screen.getByText("backgroundTasks.background")).toBeTruthy();
    expect(screen.getByTestId("background-task-browser-uid").textContent).toBe(
      "browser",
    );
    fireEvent.click(screen.getByText("Use the browser"));
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
