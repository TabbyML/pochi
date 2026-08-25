import type { Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAddSubtaskResult } from "./use-subtask-completed";

const addResultMock = vi.hoisted(() => vi.fn());
const autoApproveGuardMock = vi.hoisted(() => ({ current: "stop" }));
const extractTaskResultMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({ storeId: "store-1" }),
}));

vi.mock("../lib/chat-state", () => ({
  useAutoApproveGuard: () => autoApproveGuardMock,
  useToolCallLifeCycle: () => ({
    getToolCallLifeCycle: () => ({
      status: "init",
      addResult: addResultMock,
    }),
  }),
}));

vi.mock("@getpochi/livekit", () => ({
  catalog: {
    queries: {
      makeMessagesQuery: vi.fn(),
    },
  },
  extractTaskResult: extractTaskResultMock,
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    getStaticToolName: () => "newTask",
  };
});

const auditTodo: Todo = {
  id: "todo-1",
  content: "Add one test",
  status: "in-progress",
  priority: "medium",
};

function makeParentMessage(): Message {
  return {
    id: "assistant-1",
    role: "assistant",
    parts: [
      {
        type: "tool-newTask",
        toolCallId: "tool-call-1",
        state: "input-available",
        input: {
          agentType: "attemptTodoCompletion",
          _meta: {
            uid: "subtask-1",
            todos: [auditTodo],
          },
        },
      },
    ],
  } as Message;
}

describe("useAddSubtaskResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    autoApproveGuardMock.current = "stop";
  });

  it("resolves attemptTodoCompletion subtask output before completing the parent tool call", async () => {
    extractTaskResultMock.mockReturnValue({
      summary: "Done.",
      todoUpdates: [{ id: "todo-1", status: "completed" }],
    });

    renderHook(() => useAddSubtaskResult({ messages: [makeParentMessage()] }));

    await waitFor(() => expect(addResultMock).toHaveBeenCalled());
    expect(addResultMock).toHaveBeenCalledWith({
      result: {
        summary: "Done.",
        todos: [{ ...auditTodo, status: "completed" }],
      },
    });
    expect(autoApproveGuardMock.current).toBe("auto");
  });

  it("resolves a completed parallel subtask that is not the last message part", async () => {
    const message = makeParentMessage();
    message.parts.push({
      type: "tool-newTask",
      toolCallId: "tool-call-2",
      state: "input-available",
      input: {
        description: "Second parallel subtask",
        prompt: "Explore the second area",
        agentType: "explore",
        _meta: { uid: "subtask-2" },
      },
    });
    extractTaskResultMock.mockImplementation(
      (_store: unknown, subtaskUid: string) =>
        subtaskUid === "subtask-1"
          ? {
              summary: "First parallel subtask completed.",
              todoUpdates: [{ id: "todo-1", status: "completed" }],
            }
          : undefined,
    );

    renderHook(() => useAddSubtaskResult({ messages: [message] }));

    await waitFor(() =>
      expect(addResultMock).toHaveBeenCalledWith({
        result: {
          summary: "First parallel subtask completed.",
          todos: [{ ...auditTodo, status: "completed" }],
        },
      }),
    );
    expect(extractTaskResultMock).toHaveBeenCalledWith(
      { storeId: "store-1" },
      "subtask-1",
    );
    expect(autoApproveGuardMock.current).toBe("auto");
  });
});
