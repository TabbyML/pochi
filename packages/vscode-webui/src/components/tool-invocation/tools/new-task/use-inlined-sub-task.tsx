import type { TaskThreadSource } from "@/components/task-thread";
import type { Message } from "@getpochi/livekit";
import type { ToolProps } from "../../types";

export function useInlinedSubTask(
  tool: ToolProps<"newTask" | "newCustomAgent">["tool"],
): TaskThreadSource | undefined {
  if (tool.state === "input-streaming") {
    return undefined;
  }

  const subtask = tool.input?._transient?.task;
  if (!subtask) {
    return undefined;
  }

  return {
    messages: (subtask?.messages as Message[]) ?? [],
    todos: subtask?.todos ?? [],
  };
}
