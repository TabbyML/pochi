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
  const subtask = tool.input?._transient?.task;

  const { todos } = useTodos({
    initialTodos: subtask?.todos as Readonly<Todo[]> | undefined,
    messages: (subtask?.messages ?? []) as Message[],
    todosRef,
  });

  if (tool.input?.background) {
    return undefined;
  }

  if (tool.state === "input-streaming") {
    return undefined;
  }

  if (!subtask) {
    return undefined;
  }

  return {
    messages: (subtask?.messages as Message[]) ?? [],
    todos,
  };
}
