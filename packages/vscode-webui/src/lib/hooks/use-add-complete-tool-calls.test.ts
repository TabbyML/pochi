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

const baseTodos: Todo[] = [
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

function findToolPart(message: Message | undefined, toolCallId: string) {
  return message?.parts.find(
    (part) => part.type === "tool-newTask" && part.toolCallId === toolCallId,
  );
}

describe("getTodoCompletionUpdate", () => {
  it("returns a completion update when attemptTodoCompletion succeeds", () => {
    const resolvedTodos: Todo[] = [{ ...baseTodos[0], status: "completed" }];
    const update = getTodoCompletionUpdate({
      message: makeAttemptTodoCompletionMessage(),
      toolCallId: "tool-1",
      output: {
        result: {
          success: true,
          summary: "Done.",
          todos: resolvedTodos,
        },
      },
    });

    expect(update).toMatchObject({
      toolCallId: "tool-1",
      status: "completed",
      todos: [{ id: "todo-1", status: "completed" }],
    });
    expect(findToolPart(update?.message, "tool-1")).toMatchObject({
      state: "output-available",
    });
  });

  it("does not parse stringified attemptTodoCompletion results", () => {
    const resolvedTodos: Todo[] = [{ ...baseTodos[0], status: "completed" }];
    const update = getTodoCompletionUpdate({
      message: makeAttemptTodoCompletionMessage(),
      toolCallId: "tool-1",
      output: {
        result: JSON.stringify({
          success: true,
          summary: "Done.",
          todos: resolvedTodos,
        }),
      },
    });

    expect(update).toBeUndefined();
  });

  it("uses resolved todos from attemptTodoCompletion results", () => {
    const resolvedTodos: Todo[] = [
      {
        id: "resolved-todo-1",
        content: "Resolved todo",
        status: "completed",
        priority: "medium",
      },
    ];
    const update = getTodoCompletionUpdate({
      message: makeAttemptTodoCompletionMessage(),
      toolCallId: "tool-1",
      output: {
        result: {
          success: true,
          summary: "Done.",
          todos: resolvedTodos,
        },
      },
    });

    expect(update?.todos).toEqual(resolvedTodos);
  });

  it("does not return a completion update when resolved todos still need work", () => {
    const update = getTodoCompletionUpdate({
      message: makeAttemptTodoCompletionMessage(),
      toolCallId: "tool-1",
      output: {
        result: {
          success: true,
          summary: "Done.",
          todos: baseTodos,
        },
      },
    });

    expect(update).toBeUndefined();
  });

  it("does not return a completion update for malformed resolved results", () => {
    const update = getTodoCompletionUpdate({
      message: makeAttemptTodoCompletionMessage(),
      toolCallId: "tool-1",
      output: {
        result: {
          success: true,
          summary: "Done.",
        },
      },
    });

    expect(update).toBeUndefined();
  });

  it("does not return a completion update when attemptTodoCompletion rejects completion", () => {
    const update = getTodoCompletionUpdate({
      message: makeAttemptTodoCompletionMessage(),
      toolCallId: "tool-1",
      output: {
        result: {
          success: false,
          summary: "More work remains.",
          todos: baseTodos,
        },
      },
    });

    expect(update).toBeUndefined();
  });

  it("uses resolved todos without requiring one todo update", () => {
    const resolvedTodos: Todo[] = [{ ...baseTodos[0], status: "completed" }];
    const update = getTodoCompletionUpdate({
      message: makeAttemptTodoCompletionMessage(),
      toolCallId: "tool-1",
      output: {
        result: {
          success: true,
          summary: "Done.",
          todos: resolvedTodos,
        },
      },
    });

    expect(update?.todos).toEqual(resolvedTodos);
  });
});
