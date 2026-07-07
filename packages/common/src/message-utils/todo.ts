import type { Todo } from "@getpochi/tools";

export function hasTodos(todos?: readonly Todo[]): boolean {
  return (todos?.length ?? 0) > 0;
}

export function hasActiveTodos(todos?: readonly Todo[]): boolean {
  return (
    todos?.some(
      (todo) => todo.status === "pending" || todo.status === "in-progress",
    ) ?? false
  );
}
