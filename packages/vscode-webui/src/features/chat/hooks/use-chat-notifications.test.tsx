// @vitest-environment jsdom
import type { Message, Task } from "@getpochi/livekit";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useChatNotifications } from "./use-chat-notifications";

const sendNotificationMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/hooks/use-mcp", () => ({
  useMcp: () => ({ toolset: {} }),
}));

vi.mock("@/features/settings", () => ({
  getPendingToolcallApproval: vi.fn(),
  isToolAutoApproved: vi.fn(),
}));

vi.mock("@/features/retry", () => ({
  getReadyForRetryError: () => new Error("content-filter"),
  isRetryableError: () => false,
}));

vi.mock("@/lib/vscode", () => ({
  vscodeHost: {
    onTaskRunning: vi.fn(),
  },
}));

vi.mock("../lib/chat-state", () => ({
  useRetryCount: () => ({ retryCount: undefined }),
}));

vi.mock("../lib/use-send-task-notification", () => ({
  useSendTaskNotification: () => ({
    sendNotification: sendNotificationMock,
    clearNotification: vi.fn(),
  }),
}));

describe("useChatNotifications", () => {
  it("notifies for content filtering even when automatic retries are enabled", () => {
    const { result } = renderHook(() =>
      useChatNotifications({
        uid: "task-1",
        task: { id: "task-1", cwd: "/workspace" } as Task,
        isSubTask: false,
        autoApproveGuard: { current: "auto" } as never,
        autoApproveActive: true,
        autoApproveSettings: {
          retry: true,
          maxRetryLimit: 3,
        } as never,
      }),
    );

    const messages = [
      {
        id: "assistant-content-filtered",
        role: "assistant",
        parts: [{ type: "text", text: "Request refused." }],
        metadata: {
          kind: "assistant",
          totalTokens: 10,
          finishReason: "content-filter",
        },
      } as Message,
    ];

    act(() => {
      result.current.onStreamFinish.current({
        id: "task-1",
        cwd: "/workspace",
        status: "pending-input",
        messages,
      });
    });

    expect(sendNotificationMock).toHaveBeenCalledWith("pending-input", {
      uid: "task-1",
      isSubTask: false,
    });
  });
});
