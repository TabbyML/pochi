// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import {
  getTodoCompletionUpdate,
  useAddCompleteToolCalls,
} from "./use-add-complete-tool-calls";

const mocks = vi.hoisted(() => ({
  completeToolCalls: [] as unknown[],
}));

vi.mock("@/features/chat", () => ({
  useToolCallLifeCycle: () => ({ completeToolCalls: mocks.completeToolCalls }),
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
  beforeEach(() => {
    mocks.completeToolCalls = [];
  });

  it("returns resolved todos when attemptTodoCompletion completes all todos", () => {
    const resolvedTodos: Todo[] = [{ ...baseTodos[0], status: "completed" }];
    const update = getTodoCompletionUpdate({
      message: makeAttemptTodoCompletionMessage(),
      toolCallId: "tool-1",
      output: {
        result: {
          summary: "Done.",
          todos: resolvedTodos,
        },
      },
    });

    expect(update).toMatchObject({
      toolCallId: "tool-1",
      status: "completed",
      todos: resolvedTodos,
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
          summary: "Done.",
          todos: resolvedTodos,
        }),
      },
    });

    expect(update).toBeUndefined();
  });

  it("returns todos when every todo is resolved", () => {
    const resolvedTodos: Todo[] = [
      {
        id: "resolved-todo-1",
        content: "Resolved todo",
        status: "completed",
        priority: "medium",
      },
      {
        id: "blocked-todo-1",
        content: "Blocked todo",
        status: "cancelled",
        priority: "medium",
      },
    ];
    const update = getTodoCompletionUpdate({
      message: makeAttemptTodoCompletionMessage(),
      toolCallId: "tool-1",
      output: {
        result: {
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
          summary: "Done.",
        },
      },
    });

    expect(update).toBeUndefined();
  });
});

describe("useAddCompleteToolCalls", () => {
  beforeEach(() => {
    mocks.completeToolCalls = [];
  });

  it("reports todo completion updates through one action", async () => {
    const resolvedTodos: Todo[] = [{ ...baseTodos[0], status: "completed" }];
    const dispose = vi.fn();
    const addToolOutput = vi.fn();
    const updateTodoCompletion = vi.fn();
    mocks.completeToolCalls = [
      {
        status: "complete",
        toolName: "newTask",
        toolCallId: "tool-1",
        complete: {
          reason: "execute-finish",
          result: {
            result: {
              summary: "Done.",
              todos: resolvedTodos,
            },
          },
        },
        dispose,
      },
    ];

    renderHook(() =>
      useAddCompleteToolCalls({
        messages: [makeAttemptTodoCompletionMessage()],
        enable: true,
        addToolOutput,
        updateTodoCompletion,
      }),
    );

    await waitFor(() =>
      expect(updateTodoCompletion).toHaveBeenCalledWith(
        expect.objectContaining({
          todos: resolvedTodos,
          status: "completed",
        }),
      ),
    );
    expect(addToolOutput).toHaveBeenCalledWith({
      tool: "newTask",
      toolCallId: "tool-1",
      output: {
        result: {
          summary: "Done.",
          todos: resolvedTodos,
        },
      },
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
