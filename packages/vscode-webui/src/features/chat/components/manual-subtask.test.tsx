import type { Message } from "@getpochi/livekit";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolCallApprovalButton } from "../../approval/components/tool-call-approval-button";
import { ChatContextProvider } from "../lib/chat-state";
import { SubtaskPage } from "./subtask-page";

const state = vi.hoisted(() => ({
  tool: undefined as Message["parts"][number] | undefined,
  offhand: true,
  navigate: vi.fn(),
}));
vi.mock("@/features/chat", async () => import("../lib/chat-state"));
vi.mock("@/features/settings", () => ({
  useSelectedModels: () => ({}),
  useSubtaskOffhand: () => ({ subtaskOffhand: state.offhand }),
  useToolAutoApproval: () => false,
}));
vi.mock("@/lib/hooks/use-custom-agents", () => ({
  useCustomAgent: () => ({}),
}));
vi.mock("@/lib/hooks/use-navigate", () => ({
  useNavigate: () => state.navigate,
}));
vi.mock("@/lib/hooks/use-user-storage", () => ({
  useUserStorage: () => ({ users: {} }),
}));
const store = {
  storeId: "shared",
  useQuery: (query: { label: string }) =>
    query.label === "task"
      ? {
          id: "child",
          parentId: "parent",
          background: false,
          status: "pending-model",
        }
      : [{ data: { role: "assistant", parts: [state.tool] } }],
};
vi.mock("@/lib/use-default-store", () => ({ useDefaultStore: () => store }));
vi.mock("@/lib/vscode", () => ({ vscodeHost: { onTaskRunning: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("../page", () => ({ ChatPage: () => <div>Interactive executor</div> }));
vi.mock("./chat-skeleton", () => ({ ChatSkeleton: () => null }));
vi.mock("./background-task-debug-panel", () => ({
  BackgroundTaskDetail: () => <div>Read-only detail</div>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("manual subtask navigation", () => {
  it.each([
    ["planner", true],
    ["guide", true],
    ["explore", false],
  ] as const)(
    "opens the executor for %s (offhand=%s)",
    (agentType, offhand) => {
      state.offhand = offhand;
      const tool = {
        type: "tool-newTask" as const,
        toolCallId: "call",
        state: "input-available" as const,
        input: {
          description: "Review",
          prompt: "Review",
          agentType,
          _meta: { uid: "child" },
        },
      };
      state.tool = tool;
      function Pages() {
        const [childVisible, setChildVisible] = useState(false);
        state.navigate.mockImplementation(() => setChildVisible(true));
        return (
          <ChatContextProvider>
            {!childVisible && (
              <ToolCallApprovalButton
                taskId="parent"
                isSubTask={false}
                pendingApproval={{ name: "newTask", tool }}
              />
            )}
            {childVisible && <SubtaskPage uid="child" cwd="/repo" />}
          </ChatContextProvider>
        );
      }
      render(<Pages />);
      fireEvent.click(
        screen.getByRole("button", { name: "toolInvocation.run" }),
      );
      expect(state.navigate).toHaveBeenCalledExactlyOnceWith({
        to: "/task",
        search: { uid: "child", storeId: "shared" },
      });
      expect(screen.getByText("Interactive executor")).toBeTruthy();
    },
  );
});
