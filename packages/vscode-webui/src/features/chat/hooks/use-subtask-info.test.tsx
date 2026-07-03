import type { Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSubtaskInfo } from "./use-subtask-info";

const parentMessagesMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/settings", () => ({
  useSubtaskOffhand: () => ({ subtaskOffhand: false }),
}));

vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({
    useQuery: parentMessagesMock,
  }),
}));

vi.mock("@getpochi/livekit", () => ({
  catalog: {
    queries: {
      makeMessagesQuery: vi.fn((taskId: string) => ({ taskId })),
    },
  },
}));

const auditTodo: Todo = {
  id: "todo-1",
  content: "Add one test",
  status: "in-progress",
  priority: "medium",
};

describe("useSubtaskInfo", () => {
  it("returns audit todos from the parent newTask tool input", () => {
    parentMessagesMock.mockReturnValue([
      {
        data: {
          id: "assistant-1",
          role: "assistant",
          parts: [
            {
              type: "tool-newTask",
              toolCallId: "tool-call-1",
              state: "input-available",
              input: {
                description: "",
                agentType: "attemptTodoCompletion",
                prompt: "",
                _meta: {
                  uid: "subtask-1",
                  todos: [auditTodo],
                },
              },
            },
          ],
        } satisfies Message,
      },
    ]);

    const { result } = renderHook(() =>
      useSubtaskInfo("subtask-1", "parent-1"),
    );

    expect(result.current?.todos).toEqual([auditTodo]);
  });
});
