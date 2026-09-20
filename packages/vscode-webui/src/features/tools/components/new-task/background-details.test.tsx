import { TooltipProvider } from "@/components/ui/tooltip";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolProps } from "../types";
import { newTaskTool as NewTaskTool } from "./index";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@/features/chat", async () => ({
  ...(await vi.importActual("../../../chat/components/background-task-button")),
  ...(await vi.importActual("../../../chat/lib/chat-state/fixed-state")),
  useToolCallLifeCycle: vi.fn(),
  useBackgroundTaskStatus: () => "running",
}));
vi.mock("@/components/task-thread", () => ({ TaskThread: () => null }));
vi.mock("./attempt-todo-completion-view", () => ({
  AttemptTodoCompletionView: () => null,
}));
vi.mock("./browser-view", () => ({ BrowserView: () => null }));
vi.mock("./planner-view", () => ({ PlannerView: () => null }));
vi.mock("@/lib/hooks/use-navigate", () => ({ useNavigate: () => navigate }));
vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({
    storeId: "store",
    useQuery: () => ({ status: "pending-model" }),
  }),
}));
vi.mock("@/lib/vscode", () => ({
  isVSCodeEnvironment: () => true,
  vscodeHost: {},
}));
vi.mock("@/features/settings", () => ({ useIsDevMode: () => [false] }));
vi.mock("@/lib/hooks/use-copy-to-clipboard", () => ({
  useCopyToClipboard: () => ({ isCopied: false, copyToClipboard: vi.fn() }),
}));
vi.mock("../../hooks/use-inlined-sub-task", () => ({
  useInlinedSubTask: () => ({
    parentId: "parent",
    messages: [],
    todos: [],
    isLoading: false,
  }),
}));
vi.mock("../../hooks/use-live-sub-task", () => ({ useLiveSubTask: vi.fn() }));
vi.mock("../../../chat/components/background-task-debug-panel", () => ({
  BackgroundTaskDetail: ({
    taskId,
    onBack,
  }: { taskId: string; onBack: () => void }) => (
    <div data-testid="task-detail">
      <span>{taskId}</span>
      <button type="button" onClick={onBack}>
        Back
      </button>
    </div>
  ),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("background subtask details", () => {
  it("wraps the description after moving to the background", () => {
    const tool: ToolProps<"newTask">["tool"] = {
      type: "tool-newTask",
      toolCallId: "call",
      state: "output-available",
      input: {
        description: "Inspect every file under packages/livekit/src/background",
        prompt: "Research",
        agentType: "explore",
        background: true,
        _meta: { uid: "child" },
      },
      output: { result: "Started", backgroundJobId: "bgjob-task-child" },
    };

    render(
      <TooltipProvider>
        <NewTaskTool tool={tool} isExecuting={false} isLoading={false} />
      </TooltipProvider>,
    );

    const description = screen.getByText(tool.input.description);
    expect(description.classList.contains("break-words")).toBe(true);
    expect(description.classList.contains("truncate")).toBe(false);
    expect(
      description.parentElement?.classList.contains("whitespace-nowrap"),
    ).toBe(false);
  });

  it("keeps the parent mounted when a running subagent is inspected", () => {
    const disposeExecutor = vi.fn();
    const tool: ToolProps<"newTask">["tool"] = {
      type: "tool-newTask",
      toolCallId: "call",
      state: "output-available",
      input: {
        description: "Inspect files",
        prompt: "Research",
        agentType: "explore",
        background: true,
        _meta: { uid: "child" },
      },
      output: { result: "Started", backgroundJobId: "bgjob-task-child" },
    };
    function Parent() {
      useEffect(() => disposeExecutor, []);
      return (
        <TooltipProvider>
          <NewTaskTool tool={tool} isExecuting={false} isLoading={false} />
        </TooltipProvider>
      );
    }
    const { unmount } = render(<Parent />);
    fireEvent.click(screen.getByRole("button", { name: "explore" }));
    expect(screen.getByTestId("task-detail").textContent).toContain("child");
    expect(navigate).not.toHaveBeenCalled();
    expect(disposeExecutor).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(disposeExecutor).not.toHaveBeenCalled();
    unmount();
    expect(disposeExecutor).toHaveBeenCalledOnce();
  });
});
