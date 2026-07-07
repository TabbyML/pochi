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
  initialTodos,
  taskId,
}: {
  persistedTodos?: readonly Todo[];
  // Bootstrap todos from task creation or subtask metadata before persisted todos exist.
  initialTodos?: readonly Todo[];
  taskId?: string;
}) {
  const store = useDefaultStore();
  const todosRef = useRef<Todo[] | undefined>(undefined);
  const appliedInitialTodosRef = useRef(copyTodos(initialTodos));
  const consumedInitialTodosRef = useRef<Todo[] | undefined>(undefined);
  const [todos, setTodosImpl] = useState<Todo[]>(() => {
    const nextTodos = getInitialTodoState(persistedTodos, initialTodos);
    todosRef.current = nextTodos;
    return nextTodos;
  });

  const setTodos = useCallback((nextTodos: Todo[]): Todo[] => {
    const snapshot = copyTodos(nextTodos);
    todosRef.current = snapshot;
    setTodosImpl((current) =>
      isTodoListEqual(current, snapshot) ? current : snapshot,
    );
    return snapshot;
  }, []);

  const markInitialTodosConsumed = useCallback(() => {
    if (appliedInitialTodosRef.current.length > 0) {
      consumedInitialTodosRef.current = copyTodos(
        appliedInitialTodosRef.current,
      );
    }
  }, []);

  const isInitialTodosConsumed = useCallback((initialSnapshot: Todo[]) => {
    return (
      consumedInitialTodosRef.current !== undefined &&
      isTodoListEqual(consumedInitialTodosRef.current, initialSnapshot)
    );
  }, []);

  const updateTodos = useCallback(
    (nextTodos: Todo[]) => {
      const snapshot = setTodos(nextTodos);
      if (snapshot.length === 0) {
        markInitialTodosConsumed();
      }
      if (!taskId) return;
      store.commit(
        catalog.events.updateTodos({
          id: taskId,
          todos: snapshot,
          updatedAt: new Date(),
        }),
      );
    },
    [markInitialTodosConsumed, setTodos, store, taskId],
  );

  const updateTodoCompletion = useCallback(
    (update: TodoCompletionUpdate) => {
      const snapshot = setTodos(update.todos);
      if (snapshot.length === 0 || isTodoListResolved(snapshot)) {
        markInitialTodosConsumed();
      }
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
    [markInitialTodosConsumed, setTodos, store, taskId],
  );

  useEffect(() => {
    if (persistedTodos === undefined) {
      if (!initialTodos?.length) {
        appliedInitialTodosRef.current = [];
        setTodos(copyTodos(todosRef.current));
        return;
      }

      const initialSnapshot = copyTodos(initialTodos);
      if (isInitialTodosConsumed(initialSnapshot)) {
        setTodos(copyTodos(todosRef.current));
        return;
      }

      if (!isTodoListEqual(appliedInitialTodosRef.current, initialSnapshot)) {
        appliedInitialTodosRef.current = initialSnapshot;
        setTodos(initialSnapshot);
        return;
      }

      setTodos(copyTodos(todosRef.current));
      return;
    }

    if (persistedTodos.length > 0) {
      if (isTodoListResolved(persistedTodos)) {
        updateTodos([]);
        return;
      }

      setTodos(copyTodos(persistedTodos));
      return;
    }

    if (!initialTodos?.length) {
      appliedInitialTodosRef.current = [];
      setTodos([]);
      return;
    }

    const initialSnapshot = copyTodos(initialTodos);
    if (isInitialTodosConsumed(initialSnapshot)) {
      setTodos([]);
      return;
    }

    appliedInitialTodosRef.current = initialSnapshot;
    setTodos(initialSnapshot);
  }, [
    persistedTodos,
    initialTodos,
    isInitialTodosConsumed,
    setTodos,
    updateTodos,
  ]);

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

function isTodoListEqual(left: readonly Todo[], right: readonly Todo[]) {
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

function getInitialTodoState(
  persistedTodos: readonly Todo[] | undefined,
  initialTodos: readonly Todo[] | undefined,
): Todo[] {
  if (persistedTodos === undefined) {
    return copyTodos(initialTodos);
  }

  if (persistedTodos.length > 0 && isTodoListResolved(persistedTodos)) {
    return [];
  }

  if (persistedTodos.length > 0 || !initialTodos?.length) {
    return copyTodos(persistedTodos);
  }

  return copyTodos(initialTodos);
}
