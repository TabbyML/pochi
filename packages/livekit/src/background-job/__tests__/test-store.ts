import { vi } from "vitest";
import type { LiveKitStore, Message, Task } from "../../types";

/** In-memory materialization of the events used by background-job tests. */
export function makeJobStore() {
  const tasks = new Map<string, Task>();
  const messages = new Map<string, Message[]>();
  const listeners = new Map<() => void, { label?: string }>();
  const store = {
    storeId: "test",
    query(query: { label?: string; hash?: string }) {
      const id = [...tasks.keys(), ...messages.keys()].find(
        (id) => query.hash?.endsWith(`:${id}`) || query.hash?.endsWith(id),
      );
      switch (query.label) {
        case "backgroundTasks":
          return [...tasks.values()].filter((t) => t.background);
        case "runnableTasks":
          return [...tasks.values()].filter(
            (t) =>
              t.background &&
              (t.status === "pending-model" || t.status === "pending-tool"),
          );
        case "task":
          return id ? tasks.get(id) : undefined;
        case "messages":
          return (messages.get(id ?? "") ?? []).map((data) => ({
            id: data.id,
            taskId: id,
            data,
          }));
        case "subTasks":
          return [...tasks.values()].filter((t) => t.parentId === id);
        default:
          return undefined;
      }
    },
    commit: vi.fn((event: { name: string; args: Record<string, unknown> }) => {
      const args = event.args;
      const id = args.id as string;
      if (event.name === "v1.TaskFailed")
        tasks.set(id, {
          ...tasks.get(id),
          status: "failed",
          error: args.error,
        } as Task);
      else if (event.name === "v1.ToolsExecutionFinished") {
        for (const [taskId, taskMessages] of messages)
          messages.set(
            taskId,
            taskMessages.map((message) =>
              message.id === id
                ? ({ ...message, parts: args.parts } as Message)
                : message,
            ),
          );
      }
      for (const [listener] of listeners) listener();
    }),
    subscribe(query: { label?: string }, callback: () => void) {
      listeners.set(callback, query);
      return () => {
        listeners.delete(callback);
      };
    },
  };
  return {
    store: store as unknown as LiveKitStore,
    tasks,
    messages,
    commit: store.commit,
    setMessages(taskId: string, value: Message[]) {
      messages.set(taskId, value);
      for (const [listener] of listeners) listener();
    },
  };
}
