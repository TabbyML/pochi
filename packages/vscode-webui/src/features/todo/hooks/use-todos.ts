import { prompts } from "@getpochi/common";
import { findTodos, mergeTodos } from "@getpochi/common/message-utils";
import type { Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { useCallback, useEffect, useState } from "react";

export function useTodos({
  initialTodos,
  messages,
  todosRef,
}: {
  initialTodos?: Readonly<Todo[]>;
  messages: Message[];
  todosRef: React.RefObject<Todo[] | undefined>;
}) {
  const [todos, setTodosImpl] = useState<Todo[]>(() => {
    const newTodos = JSON.parse(JSON.stringify(initialTodos ?? []));
    todosRef.current = newTodos;
    return newTodos;
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies(todosRef): todosRef is a ref
  const setTodos = useCallback((newTodos: Todo[]) => {
    todosRef.current = newTodos;
    setTodosImpl(newTodos);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies(todosRef.current): todosRef is a ref
  const updateTodos = useCallback(
    (message: Message) => {
      const newTodos = findTodos(message);
      if (newTodos !== undefined) {
        setTodos(mergeTodos(todosRef.current || [], newTodos));
      }
    },
    [setTodos],
  );

  const lastMessage = messages.at(-1);

  // biome-ignore lint/correctness/useExhaustiveDependencies(todosRef.current): todosRef is a ref
  useEffect(() => {
    if (lastMessage && lastMessage.role === "assistant") {
      updateTodos(lastMessage);

      // Auto-mark todos as completed if this message has attempt completion
      if (lastMessage.parts.some((x) => x.type === "tool-attemptCompletion")) {
        const currentTodos = todosRef.current || [];
        if (currentTodos.length > 0) {
          const updatedTodos = currentTodos.map((todo) => {
            if (todo.status !== "cancelled") {
              return { ...todo, status: "completed" as const };
            }
            return todo;
          });

          const hasChanges = updatedTodos.some(
            (todo, index) => todo.status !== currentTodos[index]?.status,
          );

          if (hasChanges) {
            setTodos(updatedTodos);
          }
        }
      }
    }

    if (
      lastMessage &&
      lastMessage.role === "user" &&
      !isSystemReminderMessage(lastMessage)
    ) {
      const todos = todosRef.current || [];
      // Check if all todos is canceled or done.
      const allTodosDoneOrCanceled = todos.every(
        (todo) => todo.status === "completed" || todo.status === "cancelled",
      );

      if (allTodosDoneOrCanceled) {
        setTodos([]);
      }
    }
  }, [lastMessage, updateTodos, setTodos]);

  return {
    todosRef,
    todos,
  };
}

function isSystemReminderMessage(message: Message): boolean {
  return message.parts.some(
    (x) => x.type === "text" && prompts.isSystemReminder(x.text),
  );
}
