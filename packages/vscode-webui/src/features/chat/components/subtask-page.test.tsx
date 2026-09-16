import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubtaskPage } from "./subtask-page";

const state = vi.hoisted(() => ({
  background: false,
  status: "pending-tool",
  navigate: vi.fn(),
}));
vi.mock("@/lib/hooks/use-navigate", () => ({
  useNavigate: () => state.navigate,
}));
vi.mock("@/lib/hooks/use-user-storage", () => ({
  useUserStorage: () => ({ users: {} }),
}));
vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({
    storeId: "shared",
    useQuery: () => ({
      id: "child",
      parentId: "parent",
      background: state.background,
      status: state.status,
    }),
  }),
}));
vi.mock("../lib/chat-state/fixed-state", () => ({
  FixedStateChatContextProvider: ({
    children,
  }: { children: React.ReactNode }) => children,
}));
vi.mock("../page", () => ({ ChatPage: () => <div>Interactive chat</div> }));
vi.mock("./chat-skeleton", () => ({ ChatSkeleton: () => null }));
vi.mock("./background-task-debug-panel", () => ({
  BackgroundTaskDetail: ({ onBack }: { onBack: () => void }) => (
    <button type="button" onClick={onBack}>
      Task progress
    </button>
  ),
}));
afterEach(cleanup);
beforeEach(() => {
  state.background = false;
  state.status = "pending-tool";
  vi.clearAllMocks();
});

describe("subtask page execution ownership", () => {
  it("opens a foreground subtask as a complete interactive page", () => {
    render(<SubtaskPage uid="child" cwd="/repo" />);
    expect(screen.getByText("Interactive chat")).toBeTruthy();
  });
  it.each(["pending-tool", "completed"])(
    "keeps background tasks read-only, including after completion (%s)",
    (status) => {
      state.background = true;
      state.status = status;
      render(<SubtaskPage uid="child" cwd="/repo" />);
      expect(screen.getByText("Task progress")).toBeTruthy();
      expect(screen.queryByText("Interactive chat")).toBeNull();
      fireEvent.click(screen.getByText("Task progress"));
      expect(state.navigate).toHaveBeenCalledWith({
        to: "/task",
        search: { uid: "parent", storeId: "shared" },
        replace: true,
      });
    },
  );
});
