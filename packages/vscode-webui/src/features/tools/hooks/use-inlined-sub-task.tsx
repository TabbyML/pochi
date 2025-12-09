import type { TaskThreadSource } from "@/components/task-thread";
import { useTodos } from "@/features/todo";
import type { Message } from "@getpochi/livekit";
import type { Todo } from "@getpochi/tools";
import { useRef } from "react";
import type { ToolProps } from "../components/types";

export function useInlinedSubTask(
  tool: ToolProps<"newTask">["tool"],
): TaskThreadSource | undefined {
  const todosRef = useRef<Todo[] | undefined>(undefined);
  if (tool.state === "input-streaming") {
    return undefined;
  }

  const subtask = tool.input?._transient?.task;
  if (!subtask) {
    return undefined;
  }

  const { todos } = useTodos({
    initialTodos: subtask.todos,
    messages: subtask.messages as Message[],
    todosRef,
  });

  return {
    messages: (subtask?.messages as Message[]) ?? [],
    todos,
  };
}
