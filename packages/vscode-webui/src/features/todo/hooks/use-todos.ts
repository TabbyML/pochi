import type { Todo } from "@getpochi/tools";
import { useEffect, useState } from "react";

export function useTodos({
  initialTodos,
  todosRef,
}: {
  initialTodos?: Readonly<Todo[]>;
  todosRef: React.RefObject<Todo[] | undefined>;
}) {
  const [todos, setTodosImpl] = useState<Todo[]>(() => {
    const newTodos = cloneTodos(initialTodos);
    todosRef.current = newTodos;
    return newTodos;
  });

  useEffect(() => {
    const newTodos = cloneTodos(initialTodos);
    todosRef.current = newTodos;
    setTodosImpl(newTodos);
  }, [initialTodos, todosRef]);

  return {
    todosRef,
    todos,
  };
}

function cloneTodos(todos?: Readonly<Todo[]>): Todo[] {
  return JSON.parse(JSON.stringify(todos ?? []));
}
