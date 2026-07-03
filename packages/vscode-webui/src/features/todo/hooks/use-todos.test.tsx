import type { Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTodos } from "./use-todos";

const storeCommitMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/use-default-store", () => ({
  useDefaultStore: () => ({ commit: storeCommitMock }),
}));

const activeTodo: Todo = {
  id: "todo-1",
  content: "Increase coverage",
  status: "in-progress",
  priority: "medium",
};

describe("useTodos", () => {
  beforeEach(() => {
    storeCommitMock.mockClear();
  });

  it("updates local todos and ref without persistence when no task id", () => {
    const { result } = renderHook(() =>
      useTodos({ pendingTodos: [activeTodo] }),
    );
    const nextTodos = [
      {
        ...activeTodo,
        content: "Updated content",
      },
    ];

    act(() => result.current.updateTodos(nextTodos));

    expect(result.current.todos).toEqual(nextTodos);
    expect(result.current.todosRef.current).toEqual(nextTodos);
    expect(storeCommitMock).not.toHaveBeenCalled();
  });

  it("persists todo list updates through one action", () => {
    const nextTodos = [
      {
        ...activeTodo,
        content: "Updated content",
      },
    ];

    const { result } = renderHook(() =>
      useTodos({
        pendingTodos: [activeTodo],
        taskId: "task-1",
      }),
    );

    act(() => result.current.updateTodos(nextTodos));

    expect(result.current.todos).toEqual(nextTodos);
    expect(result.current.todosRef.current).toEqual(nextTodos);
    expect(storeCommitMock).toHaveBeenCalledTimes(1);
    expect(storeCommitMock.mock.calls[0]?.[0]).toMatchObject({
      name: "v1.UpdateTodos",
      args: {
        id: "task-1",
        todos: nextTodos,
      },
    });
  });

  it("persists todo completion updates through one action", () => {
    const completionMessage = {
      id: "assistant-1",
      role: "assistant",
      parts: [],
    } as unknown as Message;

    const { result } = renderHook(() =>
      useTodos({
        pendingTodos: [activeTodo],
        taskId: "task-1",
      }),
    );

    act(() =>
      result.current.updateTodoCompletion({
        message: completionMessage,
        todos: [],
        status: "completed",
      }),
    );

    expect(result.current.todos).toEqual([]);
    expect(result.current.todosRef.current).toEqual([]);
    expect(storeCommitMock).toHaveBeenCalledTimes(1);
    expect(storeCommitMock.mock.calls[0]?.[0]).toMatchObject({
      name: "v1.AttemptTodoCompletionFinished",
      args: {
        id: "task-1",
        data: completionMessage,
        todos: [],
        status: "completed",
      },
    });
  });

  it("clears persisted todos when every todo is resolved", () => {
    const resolvedTodos: Todo[] = [
      {
        ...activeTodo,
        status: "completed",
      },
      {
        id: "todo-2",
        content: "Wait for user input",
        status: "cancelled",
        priority: "medium",
      },
    ];

    const { result } = renderHook(() =>
      useTodos({
        persistedTodos: resolvedTodos,
        taskId: "task-1",
      }),
    );

    expect(result.current.todos).toEqual([]);
    expect(result.current.todosRef.current).toEqual([]);
    expect(storeCommitMock).toHaveBeenCalledTimes(1);
    expect(storeCommitMock.mock.calls[0]?.[0]).toMatchObject({
      name: "v1.UpdateTodos",
      args: {
        id: "task-1",
        todos: [],
      },
    });
  });

  it("does not restore pending todos after clearing resolved persisted todos", () => {
    const resolvedTodos: Todo[] = [
      {
        ...activeTodo,
        status: "completed",
      },
    ];

    const { result, rerender } = renderHook(
      ({ persistedTodos }: { persistedTodos: readonly Todo[] }) =>
        useTodos({
          persistedTodos,
          pendingTodos: [activeTodo],
          taskId: "task-1",
        }),
      {
        initialProps: {
          persistedTodos: resolvedTodos,
        },
      },
    );

    expect(result.current.todos).toEqual([]);

    rerender({ persistedTodos: [] });

    expect(result.current.todos).toEqual([]);
    expect(result.current.todosRef.current).toEqual([]);
  });

  it("keeps explicit pending todos visible until they are persisted", () => {
    const { result, rerender } = renderHook(
      ({ persistedTodos }: { persistedTodos?: readonly Todo[] }) =>
        useTodos({ persistedTodos, pendingTodos: [activeTodo] }),
      {
        initialProps: {
          persistedTodos: undefined as readonly Todo[] | undefined,
        },
      },
    );

    expect(result.current.todos).toEqual([activeTodo]);
    expect(result.current.todosRef.current).toEqual([activeTodo]);

    rerender({ persistedTodos: [] });

    expect(result.current.todos).toEqual([activeTodo]);
    expect(result.current.todosRef.current).toEqual([activeTodo]);
  });

  it("clears pending todos when persisted todos are empty and no pending source remains", () => {
    const { result, rerender } = renderHook(
      ({
        persistedTodos,
        pendingTodos,
      }: {
        persistedTodos?: readonly Todo[];
        pendingTodos?: readonly Todo[];
      }) => useTodos({ persistedTodos, pendingTodos }),
      {
        initialProps: {
          persistedTodos: undefined as readonly Todo[] | undefined,
          pendingTodos: [activeTodo] as readonly Todo[] | undefined,
        },
      },
    );

    expect(result.current.todos).toEqual([activeTodo]);

    rerender({ persistedTodos: [], pendingTodos: undefined });

    expect(result.current.todos).toEqual([]);
    expect(result.current.todosRef.current).toEqual([]);
  });

  it("does not restore consumed pending todos after deletion", () => {
    const { result, rerender } = renderHook(
      ({ persistedTodos }: { persistedTodos?: readonly Todo[] }) =>
        useTodos({ persistedTodos, pendingTodos: [activeTodo] }),
      {
        initialProps: {
          persistedTodos: undefined as readonly Todo[] | undefined,
        },
      },
    );

    rerender({ persistedTodos: [activeTodo] });
    expect(result.current.todos).toEqual([activeTodo]);

    act(() => result.current.updateTodos([]));
    rerender({ persistedTodos: [] });

    expect(result.current.todos).toEqual([]);
    expect(result.current.todosRef.current).toEqual([]);
  });
});
