import type { TaskThreadSource } from "@/components/task-thread";
import type { Message } from "@getpochi/livekit";
import type { ToolProps } from "../components/types";

export function useInlinedSubTask(
  tool: ToolProps<"newTask">["tool"],
): TaskThreadSource | undefined {
  const subtask = tool.input?._transient?.task;

  if (tool.state === "input-streaming") {
    return undefined;
  }

  if (!subtask) {
    return undefined;
  }

  return {
    messages: (subtask?.messages as Message[]) ?? [],
    todos: [],
  };
}
