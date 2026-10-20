import { parseTaskReferences } from "@getpochi/common";
import type { Message } from "@getpochi/livekit";
import { type ReactNode, createContext, useContext, useMemo } from "react";

const TaskReferenceTitleContext = createContext<ReadonlyMap<string, string>>(
  new Map(),
);

/**
 * Collects the titles recorded in the `<task>` tags of the user
 * messages, so a task shows its title wherever it appears in the conversation
 * (e.g. when the model reads its record) even if the task history has no entry.
 */
export function TaskReferenceContextProvider({
  messages,
  children,
}: { messages: Message[]; children: ReactNode }) {
  const titles = useMemo(() => {
    const map = new Map<string, string>();
    for (const message of messages) {
      if (message.role !== "user") continue;
      for (const part of message.parts) {
        if (part.type !== "text") continue;
        for (const ref of parseTaskReferences(part.text)) {
          map.set(ref.id, ref.title);
        }
      }
    }
    return map;
  }, [messages]);

  return (
    <TaskReferenceTitleContext.Provider value={titles}>
      {children}
    </TaskReferenceTitleContext.Provider>
  );
}

export function useMentionedTaskTitle(id: string): string | undefined {
  return useContext(TaskReferenceTitleContext).get(id);
}
