import type { TaskThreadSource } from "@/components/task-thread";
import { useDefaultStore } from "@/lib/use-default-store";
import { type Message, catalog } from "@getpochi/livekit";
import { useMemo } from "react";

/**
 * Read-only view of a sub task that is no longer running.
 *
 * Unlike `useLiveSubTask`, this does not build a `LiveChatKit` (chat transport,
 * background task executor, memory adaptors), a `useChat` instance, retry
 * timers or an abort controller. A parent task that spawned many sub tasks
 * would otherwise keep one full chat runtime alive per sub task for the whole
 * lifetime of the webview, which is a major contributor to renderer memory
 * pressure (all Pochi task panes share a single renderer process).
 */
export function useStoredSubTask(
  uid: string,
): (TaskThreadSource & { parentId: string }) | undefined {
  const store = useDefaultStore();
  const task = store.useQuery(catalog.queries.makeTaskQuery(uid));
  const messageRows = store.useQuery(catalog.queries.makeMessagesQuery(uid));

  const messages = useMemo(
    () => messageRows.map((row) => row.data as Message),
    [messageRows],
  );

  if (!task?.parentId) {
    // The task is not found in store (or is not a sub task).
    return undefined;
  }

  return {
    parentId: task.parentId,
    messages,
    todos: [],
    isLoading: false,
  };
}
