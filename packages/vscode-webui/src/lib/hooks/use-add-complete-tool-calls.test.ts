import { describe, expect, it, vi } from "vitest";
import type { Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { getTodoCompletionUpdate } from "./use-add-complete-tool-calls";

vi.mock("@/features/chat", () => ({
  useToolCallLifeCycle: () => ({ completeToolCalls: [] }),
}));
vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({ commit: vi.fn() }),
}));

const todos: Todo[] = [
  {
    id: "todo-1",
    content: "Implement todo mode",
    status: "in-progress",
    priority: "medium",
  },
];

function makeAttemptTodoCompletionMessage(): Message {
  return {
    id: "assistant-1",
    role: "assistant",
    parts: [
      {
        type: "tool-newTask",
        toolCallId: "tool-1",
        state: "input-available",
        input: {
          agentType: "attemptTodoCompletion",
        },
      },
    ],
  } as Message;
}

describe("getTodoCompletionUpdate", () => {
  it("returns a completion update when attemptTodoCompletion succeeds", () => {
    const update = getTodoCompletionUpdate({
      message: makeAttemptTodoCompletionMessage(),
      toolCallId: "tool-1",
      output: {
        result: JSON.stringify({
          success: true,
          summary: "Done.",
          todoUpdates: [{ status: "completed" }],
        }),
      },
      todos,
    });

    expect(update).toMatchObject({
      toolCallId: "tool-1",
      status: "completed",
      todos: [{ id: "todo-1", status: "completed" }],
    });
    expect(update?.message.parts[0]).toMatchObject({
      state: "output-available",
    });
  });

  it("does not return a completion update when attemptTodoCompletion rejects completion", () => {
    const update = getTodoCompletionUpdate({
      message: makeAttemptTodoCompletionMessage(),
      toolCallId: "tool-1",
      output: {
        result: JSON.stringify({
          success: false,
          summary: "More work remains.",
          todoUpdates: [{ status: "in-progress" }],
        }),
      },
      todos,
    });

    expect(update).toBeUndefined();
  });

  it("does not return a completion update without one todo update", () => {
    const update = getTodoCompletionUpdate({
      message: makeAttemptTodoCompletionMessage(),
      toolCallId: "tool-1",
      output: {
        result: JSON.stringify({
          success: true,
          summary: "Done.",
          todoUpdates: [],
        }),
      },
      todos,
    });

    expect(update).toBeUndefined();
  });
});
