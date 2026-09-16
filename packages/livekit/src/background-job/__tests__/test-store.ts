import { vi } from "vitest";
import type { LiveKitStore, Message, Task } from "../../types";

/** In-memory materialization of the events used by background-job tests. */
export function makeJobStore() {
  const tasks = new Map<string, Task>();
  const messages = new Map<string, Message[]>();
  const listeners = new Map<
    (value: unknown) => void,
    { label?: string; hash?: string }
  >();
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
    commit: vi.fn(
      (...events: { name: string; args: Record<string, unknown> }[]) => {
        for (const event of events) {
          const args = event.args;
          const id = args.id as string;
          if (event.name === "v1.TaskFailed")
            tasks.set(id, {
              ...tasks.get(id),
              status: "failed",
              error: args.error,
            } as Task);
          else if (event.name === "v1.TaskBackgrounded")
            tasks.set(id, { ...tasks.get(id), background: true } as Task);
          else if (event.name === "v1.ChatStreamStarted") {
            tasks.set(id, {
              ...tasks.get(id),
              status: "pending-model",
            } as Task);
            const message = args.data as Message;
            const previous = messages.get(id) ?? [];
            messages.set(
              id,
              previous.some((m) => m.id === message.id)
                ? previous.map((m) => (m.id === message.id ? message : m))
                : [...previous, message],
            );
          } else if (event.name === "v1.TaskInited") {
            tasks.set(id, {
              ...args,
              status: "pending-model",
            } as unknown as Task);
            messages.set(
              id,
              (args.initMessages as Message[] | undefined) ?? [],
            );
          } else if (event.name === "v1.ToolsExecutionFinished") {
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
        }
        // Like a LiveStore transaction, observers see all events applied together.
        for (const [listener, query] of listeners) listener(store.query(query));
      },
    ),
    subscribe(
      query: { label?: string; hash?: string },
      callback: (value: unknown) => void,
    ) {
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
      for (const [listener, query] of listeners) listener(store.query(query));
    },
  };
}
