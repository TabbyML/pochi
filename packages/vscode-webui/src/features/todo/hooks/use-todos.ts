import type { Todo } from "@getpochi/tools";
import { useCallback, useEffect, useRef, useState } from "react";

export function useTodos({
  initialTodos,
  todosRef,
}: {
  initialTodos?: readonly Todo[];
  todosRef: React.RefObject<Todo[] | undefined>;
}) {
  const consumedTodoIdsRef = useRef(new Set<string>());
  const [todos, setTodosImpl] = useState<Todo[]>(() => {
    const nextTodos = copyTodos(todosRef.current ?? initialTodos);
    todosRef.current = nextTodos;
    return nextTodos;
  });

  const setTodos = useCallback(
    (nextTodos: Todo[]) => {
      const snapshot = copyTodos(nextTodos);
      todosRef.current = snapshot;
      setTodosImpl(snapshot);
    },
    [todosRef],
  );

  useEffect(() => {
    if (initialTodos?.length) {
      const persistedTodoIds = new Set(initialTodos.map((todo) => todo.id));
      for (const todo of todosRef.current ?? []) {
        if (persistedTodoIds.has(todo.id)) {
          consumedTodoIdsRef.current.add(todo.id);
        }
      }
      setTodos(copyTodos(initialTodos));
      return;
    }

    const unpersistedTodos = (todosRef.current ?? []).filter(
      (todo) => !consumedTodoIdsRef.current.has(todo.id),
    );
    setTodos(unpersistedTodos);
  }, [initialTodos, setTodos, todosRef]);

  return {
    todos,
    setTodos,
  };
}

function copyTodos(todos?: readonly Todo[]): Todo[] {
  return todos ? [...todos] : [];
}
