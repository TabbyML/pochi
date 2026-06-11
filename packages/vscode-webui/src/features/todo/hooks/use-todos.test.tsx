// @vitest-environment jsdom
import type { Todo } from "@getpochi/tools";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { describe, expect, it } from "vitest";
import { useTodos } from "./use-todos";

describe("useTodos", () => {
  it("exposes task todos without reading message-derived todo updates", () => {
    const initialTodos: Todo[] = [
      {
        id: "todo-1",
        content: "Finish the task",
        status: "in-progress",
        priority: "medium",
      },
    ];
    const { result } = renderHook(() => {
      const todosRef = useRef<Todo[] | undefined>(undefined);
      return useTodos({
        initialTodos,
        todosRef,
      });
    });

    expect(result.current.todos).toEqual(initialTodos);
  });
});
