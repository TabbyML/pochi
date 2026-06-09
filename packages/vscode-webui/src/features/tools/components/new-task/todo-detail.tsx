import { cn } from "@/lib/utils";
import type { Todo } from "@getpochi/tools";
import { Circle, CircleCheckBig, CircleDot } from "lucide-react";

interface TodoDetailProps {
  todos: Todo[];
}

export function TodoDetail({ todos }: TodoDetailProps) {
  const visibleTodos = todos.filter((todo) => todo.status !== "cancelled");

  if (visibleTodos.length === 0) {
    return null;
  }

  return (
    <div className="my-1 flex flex-col gap-0.5 py-1 pr-2 pl-6">
      {visibleTodos.map((todo) => (
        <span
          key={todo.id}
          className={cn("flex items-center gap-1.5 text-sm", {
            "text-muted-foreground line-through": todo.status === "completed",
            "animated-gradient-text": todo.status === "in-progress",
          })}
        >
          {todo.status === "completed" ? (
            <CircleCheckBig className="size-3.5 shrink-0 text-muted-foreground" />
          ) : todo.status === "in-progress" ? (
            <CircleDot className="size-3.5 shrink-0" />
          ) : (
            <Circle className="size-3.5 shrink-0 text-muted-foreground/70" />
          )}
          <span className="truncate">{todo.content}</span>
        </span>
      ))}
    </div>
  );
}
