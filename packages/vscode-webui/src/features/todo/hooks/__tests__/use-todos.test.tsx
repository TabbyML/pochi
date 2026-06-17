// @vitest-environment jsdom
import type { Task } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useTodos } from "../use-todos";

const todoToAdd: Todo = {
  id: "todo-1",
  content: "Increase test coverage",
  status: "in-progress",
  priority: "medium",
};

const existingTodo: Todo = {
  id: "todo-existing",
  content: "Existing todo",
  status: "in-progress",
  priority: "medium",
};

function makeTask(todos: Todo[]): Task {
  return { todos } as unknown as Task;
}

describe("useTodos", () => {
  it("adds pending todos when task todos are empty", async () => {
    const initialProps: { task?: Task; todosToAdd?: Todo[] } = {
      task: undefined,
      todosToAdd: [todoToAdd],
    };
    const { result, rerender } = renderHook(
      ({ task, todosToAdd }: typeof initialProps) =>
        useTodos({ task, todosToAdd }),
      { initialProps },
    );

    expect(result.current.currentTodos).toEqual([todoToAdd]);
    expect(result.current.todosRef.current).toEqual([todoToAdd]);

    rerender({ task: makeTask([]), todosToAdd: [todoToAdd] });
    await waitFor(() =>
      expect(result.current.currentTodos).toEqual([todoToAdd]),
    );
  });

  it("does not add pending todos while task todos are non-empty", () => {
    const initialProps: { task?: Task; todosToAdd?: Todo[] } = {
      task: makeTask([existingTodo]),
      todosToAdd: [todoToAdd],
    };
    const { result } = renderHook(
      ({ task, todosToAdd }: typeof initialProps) =>
        useTodos({ task, todosToAdd }),
      { initialProps },
    );

    expect(result.current.currentTodos).toEqual([existingTodo]);
    expect(result.current.todosRef.current).toEqual([existingTodo]);
  });

  it("does not re-add a pending todo after it was persisted and deleted", async () => {
    const initialProps: { task?: Task; todosToAdd?: Todo[] } = {
      task: undefined,
      todosToAdd: [todoToAdd],
    };
    const { result, rerender } = renderHook(
      ({ task, todosToAdd }: typeof initialProps) =>
        useTodos({ task, todosToAdd }),
      { initialProps },
    );

    rerender({ task: makeTask([todoToAdd]), todosToAdd: [todoToAdd] });
    await waitFor(() =>
      expect(result.current.currentTodos).toEqual([todoToAdd]),
    );

    rerender({ task: makeTask([]), todosToAdd: [todoToAdd] });
    await waitFor(() => expect(result.current.currentTodos).toEqual([]));
    expect(result.current.todosRef.current).toEqual([]);
  });

  it("adds a different pending todo id after previous todos were deleted", async () => {
    const nextTodo = { ...todoToAdd, id: "todo-2", content: "Next todo" };
    const initialProps: { task?: Task; todosToAdd?: Todo[] } = {
      task: undefined,
      todosToAdd: [todoToAdd],
    };
    const { result, rerender } = renderHook(
      ({ task, todosToAdd }: typeof initialProps) =>
        useTodos({ task, todosToAdd }),
      { initialProps },
    );

    rerender({ task: makeTask([todoToAdd]), todosToAdd: [todoToAdd] });
    await waitFor(() =>
      expect(result.current.currentTodos).toEqual([todoToAdd]),
    );

    rerender({ task: makeTask([]), todosToAdd: [todoToAdd] });
    await waitFor(() => expect(result.current.currentTodos).toEqual([]));

    rerender({ task: makeTask([]), todosToAdd: [nextTodo] });
    await waitFor(() =>
      expect(result.current.currentTodos).toEqual([nextTodo]),
    );
  });
});
