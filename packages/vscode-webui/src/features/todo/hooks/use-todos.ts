import { useDefaultStore } from "@/lib/use-default-store";
import { type Message, type TaskStatusLike, catalog } from "@getpochi/livekit";
import { type Todo, isTodoListResolved } from "@getpochi/tools";
import { useCallback, useEffect, useRef, useState } from "react";

export type TodoCompletionUpdate = {
  message: Message;
  todos: Todo[];
  status: Extract<TaskStatusLike, "completed" | "pending-input">;
};

export function useTodos({
  persistedTodos,
  pendingTodos,
  taskId,
}: {
  persistedTodos?: readonly Todo[];
  pendingTodos?: readonly Todo[];
  taskId?: string;
}) {
  const store = useDefaultStore();
  const todosRef = useRef<Todo[] | undefined>(undefined);
  const consumedTodoIdsRef = useRef(new Set<string>());
  const appliedPendingTodosRef = useRef(copyTodos(pendingTodos));
  const [todos, setTodosImpl] = useState<Todo[]>(() => {
    const nextTodos = getInitialTodos(persistedTodos, pendingTodos);
    todosRef.current = nextTodos;
    return nextTodos;
  });

  const setTodos = useCallback((nextTodos: Todo[]): Todo[] => {
    const snapshot = copyTodos(nextTodos);
    todosRef.current = snapshot;
    setTodosImpl((current) =>
      areTodosEqual(current, snapshot) ? current : snapshot,
    );
    return snapshot;
  }, []);

  const updateTodos = useCallback(
    (nextTodos: Todo[]) => {
      const snapshot = setTodos(nextTodos);
      if (!taskId) return;
      store.commit(
        catalog.events.updateTodos({
          id: taskId,
          todos: snapshot,
          updatedAt: new Date(),
        }),
      );
    },
    [setTodos, store, taskId],
  );

  const updateTodoCompletion = useCallback(
    (update: TodoCompletionUpdate) => {
      const snapshot = setTodos(update.todos);
      if (!taskId) return;
      store.commit(
        catalog.events.attemptTodoCompletionFinished({
          id: taskId,
          data: update.message,
          todos: snapshot,
          status: update.status,
          updatedAt: new Date(),
        }),
      );
    },
    [setTodos, store, taskId],
  );

  useEffect(() => {
    if (persistedTodos === undefined) {
      if (!pendingTodos?.length) {
        appliedPendingTodosRef.current = [];
        setTodos(copyTodos(todosRef.current));
        return;
      }

      const pendingSnapshot = copyTodos(pendingTodos);
      if (!areTodosEqual(appliedPendingTodosRef.current, pendingSnapshot)) {
        appliedPendingTodosRef.current = pendingSnapshot;
        setTodos(pendingSnapshot);
        return;
      }

      setTodos(copyTodos(todosRef.current));
      return;
    }

    if (persistedTodos.length > 0) {
      if (isTodoListResolved(persistedTodos)) {
        for (const todo of persistedTodos) {
          consumedTodoIdsRef.current.add(todo.id);
        }
        updateTodos([]);
        return;
      }

      const persistedTodoIds = new Set(persistedTodos.map((todo) => todo.id));
      for (const todo of todosRef.current ?? []) {
        if (persistedTodoIds.has(todo.id)) {
          consumedTodoIdsRef.current.add(todo.id);
        }
      }
      setTodos(copyTodos(persistedTodos));
      return;
    }

    if (!pendingTodos?.length) {
      appliedPendingTodosRef.current = [];
      setTodos([]);
      return;
    }

    const pendingSnapshot = copyTodos(pendingTodos);
    appliedPendingTodosRef.current = pendingSnapshot;
    const unpersistedTodos = pendingSnapshot.filter(
      (todo) => !consumedTodoIdsRef.current.has(todo.id),
    );
    setTodos(unpersistedTodos);
  }, [persistedTodos, pendingTodos, setTodos, updateTodos]);

  return {
    todos,
    todosRef,
    updateTodos,
    updateTodoCompletion,
  };
}

function copyTodos(todos?: readonly Todo[]): Todo[] {
  return todos ? [...todos] : [];
}

function areTodosEqual(left: readonly Todo[], right: readonly Todo[]) {
  return (
    left.length === right.length &&
    left.every((todo, index) => {
      const other = right[index];
      if (!other) return false;
      return (
        todo.id === other.id &&
        todo.content === other.content &&
        todo.status === other.status &&
        todo.priority === other.priority
      );
    })
  );
}

function getInitialTodos(
  persistedTodos: readonly Todo[] | undefined,
  pendingTodos: readonly Todo[] | undefined,
): Todo[] {
  if (persistedTodos === undefined) {
    return copyTodos(pendingTodos);
  }

  if (persistedTodos.length > 0 && isTodoListResolved(persistedTodos)) {
    return [];
  }

  if (persistedTodos.length > 0 || !pendingTodos?.length) {
    return copyTodos(persistedTodos);
  }

  return copyTodos(pendingTodos);
}
