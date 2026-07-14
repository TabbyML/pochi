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
      useTodos({ initialTodos: [activeTodo] }),
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
        initialTodos: [activeTodo],
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
    const resolvedTodos: Todo[] = [
      {
        ...activeTodo,
        status: "completed",
      },
    ];

    const { result } = renderHook(() =>
      useTodos({
        initialTodos: [activeTodo],
        taskId: "task-1",
      }),
    );

    act(() =>
      result.current.updateTodoCompletion({
        message: completionMessage,
        todos: resolvedTodos,
        status: "completed",
      }),
    );

    expect(result.current.todos).toEqual(resolvedTodos);
    expect(result.current.todosRef.current).toEqual(resolvedTodos);
    expect(storeCommitMock).toHaveBeenCalledTimes(1);
    expect(storeCommitMock.mock.calls[0]?.[0]).toMatchObject({
      name: "v1.AttemptTodoCompletionFinished",
      args: {
        id: "task-1",
        data: completionMessage,
        todos: resolvedTodos,
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

  it("does not restore initial todos after clearing resolved persisted todos", () => {
    const resolvedTodos: Todo[] = [
      {
        ...activeTodo,
        status: "completed",
      },
    ];

    const { result, rerender } = renderHook(
      ({
        persistedTodos,
        initialTodos,
      }: {
        persistedTodos: readonly Todo[];
        initialTodos?: readonly Todo[];
      }) =>
        useTodos({
          persistedTodos,
          initialTodos,
          taskId: "task-1",
        }),
      {
        initialProps: {
          persistedTodos: resolvedTodos,
          initialTodos: [activeTodo],
        },
      },
    );

    expect(result.current.todos).toEqual([]);

    rerender({ persistedTodos: [], initialTodos: [activeTodo] });

    expect(result.current.todos).toEqual([]);
    expect(result.current.todosRef.current).toEqual([]);
  });

  it("does not restore initial todos after resolved completion todos are cleared", () => {
    const completionMessage = {
      id: "assistant-1",
      role: "assistant",
      parts: [],
    } as unknown as Message;
    const resolvedTodos: Todo[] = [
      {
        ...activeTodo,
        status: "completed",
      },
    ];

    const { result, rerender } = renderHook(
      ({
        persistedTodos,
        initialTodos,
      }: {
        persistedTodos?: readonly Todo[];
        initialTodos?: readonly Todo[];
      }) =>
        useTodos({
          persistedTodos,
          initialTodos,
          taskId: "task-1",
        }),
      {
        initialProps: {
          persistedTodos: undefined as readonly Todo[] | undefined,
          initialTodos: [activeTodo] as readonly Todo[] | undefined,
        },
      },
    );

    expect(result.current.todos).toEqual([activeTodo]);

    act(() =>
      result.current.updateTodoCompletion({
        message: completionMessage,
        todos: resolvedTodos,
        status: "completed",
      }),
    );

    expect(result.current.todos).toEqual(resolvedTodos);

    rerender({
      persistedTodos: resolvedTodos,
      initialTodos: [activeTodo],
    });

    expect(result.current.todos).toEqual([]);
    expect(result.current.todosRef.current).toEqual([]);

    rerender({
      persistedTodos: [],
      initialTodos: [activeTodo],
    });

    expect(result.current.todos).toEqual([]);
    expect(result.current.todosRef.current).toEqual([]);
  });

  it("keeps initial todos visible until they are persisted", () => {
    const { result, rerender } = renderHook(
      ({ persistedTodos }: { persistedTodos?: readonly Todo[] }) =>
        useTodos({ persistedTodos, initialTodos: [activeTodo] }),
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

  it("clears todos when persisted todos are empty and no initial source remains", () => {
    const { result, rerender } = renderHook(
      ({
        persistedTodos,
        initialTodos,
      }: {
        persistedTodos?: readonly Todo[];
        initialTodos?: readonly Todo[];
      }) => useTodos({ persistedTodos, initialTodos }),
      {
        initialProps: {
          persistedTodos: undefined as readonly Todo[] | undefined,
          initialTodos: [activeTodo] as readonly Todo[] | undefined,
        },
      },
    );

    expect(result.current.todos).toEqual([activeTodo]);

    rerender({ persistedTodos: [], initialTodos: undefined });

    expect(result.current.todos).toEqual([]);
    expect(result.current.todosRef.current).toEqual([]);
  });

  it("keeps todos cleared after deletion even while the initial source remains", () => {
    const { result, rerender } = renderHook(
      ({
        persistedTodos,
        initialTodos,
      }: {
        persistedTodos?: readonly Todo[];
        initialTodos?: readonly Todo[];
      }) => useTodos({ persistedTodos, initialTodos }),
      {
        initialProps: {
          persistedTodos: undefined as readonly Todo[] | undefined,
          initialTodos: [activeTodo] as readonly Todo[] | undefined,
        },
      },
    );

    rerender({
      persistedTodos: [activeTodo],
      initialTodos: undefined,
    });
    expect(result.current.todos).toEqual([activeTodo]);

    act(() => result.current.updateTodos([]));
    rerender({
      persistedTodos: [],
      initialTodos: [activeTodo],
    });

    expect(result.current.todos).toEqual([]);
    expect(result.current.todosRef.current).toEqual([]);
  });
});
