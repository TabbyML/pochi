// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolCallApprovalButton } from "../tool-call-approval-button";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  enqueue: vi.fn(),
  processQueue: vi.fn(),
  lifecycle: { status: "init" },
  guard: { current: "manual" },
}));
vi.mock("@/features/chat", () => ({
  useAutoApproveGuard: () => mocks.guard,
  useBatchExecuteManager: () => mocks,
  useToolCallLifeCycle: () => ({ getToolCallLifeCycle: () => mocks.lifecycle }),
}));
vi.mock("@/features/settings", () => ({
  useSelectedModels: () => ({}),
  useSubtaskOffhand: () => ({ subtaskOffhand: false }),
  useToolAutoApproval: () => false,
}));
vi.mock("@/lib/hooks/use-custom-agents", () => ({
  useCustomAgent: () => ({}),
}));
vi.mock("@/lib/hooks/use-navigate", () => ({
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({ storeId: "store-1" }),
}));
vi.mock("@/lib/vscode", () => ({ vscodeHost: { onTaskRunning: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

function approve(agentType: string, runInBackground?: boolean) {
  render(
    <ToolCallApprovalButton
      taskId="parent-1"
      isSubTask={false}
      pendingApproval={{
        name: "newTask",
        tool: {
          type: "tool-newTask",
          toolCallId: "call-1",
          state: "input-available",
          input: {
            description: "Test subtask",
            prompt: "Test",
            agentType,
            runInBackground,
            _meta: { uid: "child-1" },
          },
        },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "toolInvocation.run" }));
}

describe("background subtask approval with offhand disabled", () => {
  it.each(["", "planner", "guide"])(
    "enqueues an explicitly backgrounded %s agent without navigating",
    (agentType) => {
      approve(agentType, true);
      expect(mocks.navigate).not.toHaveBeenCalled();
      expect(mocks.enqueue).toHaveBeenCalledWith(
        "parent-1",
        expect.objectContaining({
          toolCallId: "call-1",
          input: expect.objectContaining({ runInBackground: true }),
        }),
      );
      expect(mocks.processQueue).toHaveBeenCalledWith("parent-1");
    },
  );
  it.each([
    ["", undefined],
    ["", false],
    ["browser", true],
    ["attemptTodoCompletion", true],
  ] as const)(
    "keeps %s with background=%s on the manual path",
    (agentType, flag) => {
      approve(agentType, flag);
      expect(mocks.enqueue).not.toHaveBeenCalled();
      expect(mocks.navigate).toHaveBeenCalledWith({
        to: "/task",
        search: { uid: "child-1", storeId: "store-1" },
      });
    },
  );
});
