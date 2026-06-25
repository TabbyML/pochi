import type { Todo } from "@getpochi/tools";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTodos } from "./use-todos";

const activeTodo: Todo = {
  id: "todo-1",
  content: "Increase coverage",
  status: "in-progress",
  priority: "medium",
};

describe("useTodos", () => {
  it("updates local todos and ref optimistically", () => {
    const todosRef = { current: [activeTodo] };

    const { result } = renderHook(() =>
      useTodos({ initialTodos: undefined, todosRef }),
    );
    const nextTodos = [
      {
        ...activeTodo,
        content: "Updated content",
      },
    ];

    act(() => result.current.setTodos(nextTodos));

    expect(result.current.todos).toEqual(nextTodos);
    expect(todosRef.current).toEqual(nextTodos);
  });

  it("keeps pending ref todos visible until they are persisted", () => {
    const todosRef = { current: [activeTodo] };

    const { result, rerender } = renderHook(
      ({ initialTodos }: { initialTodos?: readonly Todo[] }) =>
        useTodos({ initialTodos, todosRef }),
      {
        initialProps: {
          initialTodos: undefined as readonly Todo[] | undefined,
        },
      },
    );

    expect(result.current.todos).toEqual([activeTodo]);

    rerender({ initialTodos: [] });

    expect(result.current.todos).toEqual([activeTodo]);
  });

  it("does not restore consumed initial todos after deletion", () => {
    const todosRef = { current: [activeTodo] };

    const { result, rerender } = renderHook(
      ({ initialTodos }: { initialTodos?: readonly Todo[] }) =>
        useTodos({ initialTodos, todosRef }),
      {
        initialProps: {
          initialTodos: undefined as readonly Todo[] | undefined,
        },
      },
    );

    rerender({ initialTodos: [activeTodo] });
    expect(result.current.todos).toEqual([activeTodo]);

    act(() => result.current.setTodos([]));
    rerender({ initialTodos: [] });

    expect(result.current.todos).toEqual([]);
    expect(todosRef.current).toEqual([]);
  });
});
