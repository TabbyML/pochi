// @vitest-environment jsdom
import type { TaskThreadSource } from "@/components/task-thread";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserView } from "../new-task/browser-view";

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
const subscribeFrameMock = vi.hoisted(() => vi.fn());

vi.mock("../new-task/sub-agent-view", () => ({
  SubAgentView: subAgentViewMock,
}));

vi.mock("@/components/files-provider", () => ({
  useStoreFile: useStoreFileMock,
}));

vi.mock("@/lib/browser-session-manager", () => ({
  browserSessionManager: {
    subscribeFrame: subscribeFrameMock,
  },
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

vi.mock("@/lib/hooks/use-navigate", () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({
    storeId: "store-id",
  }),
}));

vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => false,
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

const browserTool = {
  type: "tool-newTask",
  toolCallId: "browser-call",
  state: "input-available",
  input: {
    agentType: "browser",
    description: "Use the browser",
  },
} as never;

function lastSubAgentProps() {
  return subAgentViewMock.mock.calls.at(-1)?.[0];
}

describe("BrowserView", () => {
  beforeEach(() => {
    subAgentViewMock.mockClear();
    useStoreFileMock.mockReset();
    subscribeFrameMock.mockReset();
    subscribeFrameMock.mockReturnValue(() => {});
  });

  it("keeps the trajectory in the card body until a frame or video exists", () => {
    useStoreFileMock.mockReturnValue(undefined);

    render(
      <BrowserView
        uid="browser-uid"
        tool={browserTool}
        isExecuting={true}
        isLoading={false}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(screen.getByTestId("task-thread")).toBeTruthy();
    expect(lastSubAgentProps()).toMatchObject({
      showToolCall: false,
      showTaskThread: false,
    });
  });

  it("shows the trajectory in the footer when a live frame is in the card body", async () => {
    useStoreFileMock.mockReturnValue(undefined);
    subscribeFrameMock.mockImplementation((_uid, setFrame) => {
      setFrame("frame-base64");
      return () => {};
    });

    render(
      <BrowserView
        uid="browser-uid"
        tool={browserTool}
        isExecuting={true}
        isLoading={false}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    await waitFor(() => {
      expect(screen.getByAltText("Browser view")).toBeTruthy();
    });
    expect(lastSubAgentProps()).toMatchObject({
      showToolCall: true,
      showTaskThread: true,
    });
  });

  it("shows the trajectory in the footer when a recording video is in the card body", () => {
    useStoreFileMock.mockReturnValue({ content: "blob://recording" });

    render(
      <BrowserView
        uid="browser-uid"
        tool={browserTool}
        isExecuting={false}
        isLoading={false}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(document.querySelector("video")).toBeTruthy();
    expect(lastSubAgentProps()).toMatchObject({
      showToolCall: true,
      showTaskThread: true,
    });
  });

  it("shows a stopped recording even if the parent task is still executing", () => {
    useStoreFileMock.mockReturnValue({ content: "blob://recording" });

    render(
      <BrowserView
        uid="browser-uid"
        tool={
          {
            type: "tool-newTask",
            toolCallId: "browser-call",
            state: "output-available",
            input: {
              agentType: "browser",
              description: "Use the browser",
            },
            output: {
              error: "User aborted the tool call",
            },
          } as never
        }
        isExecuting={true}
        isLoading={true}
        messages={[]}
        taskSource={taskSource}
      />,
    );

    expect(document.querySelector("video")).toBeTruthy();
    expect(lastSubAgentProps()).toMatchObject({
      showToolCall: true,
      showTaskThread: true,
    });
  });
});
