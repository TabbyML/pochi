import { useLatest } from "@/lib/hooks/use-latest";
import type { Task } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { useEffect, useRef, useState } from "react";

export function useTodos({
  task,
  todosToAdd,
}: {
  task?: Task;
  todosToAdd?: Todo[];
}) {
  const [currentTodos, setCurrentTodos] = useState<Todo[]>(() => {
    if (task?.todos?.length) return [...task.todos];
    return todosToAdd?.length ? [...todosToAdd] : [];
  });
  const todosRef = useLatest(currentTodos);
  const consumedTodoIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (task?.todos?.length) {
      for (const todo of todosToAdd ?? []) {
        consumedTodoIdsRef.current.add(todo.id);
      }
      setCurrentTodos([...task.todos]);
      return;
    }

    const nextTodosToAdd = todosToAdd?.filter(
      (todo) => !consumedTodoIdsRef.current.has(todo.id),
    );
    if (nextTodosToAdd?.length) {
      setCurrentTodos([...nextTodosToAdd]);
      return;
    }

    setCurrentTodos((todos) => (todos.length > 0 ? [] : todos));
  }, [task?.todos, todosToAdd]);

  return { currentTodos, todosRef };
}
