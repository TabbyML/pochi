import { useDefaultStore } from "@/lib/use-default-store";
import type { SubAgentResultNotification } from "@getpochi/common";
import {
  type Message,
  catalog,
  createSubAgentResultNotification,
} from "@getpochi/livekit";
import { useEffect, useRef } from "react";

/**
 * Watches background subagent tasks (newTask with runInBackground) of the
 * given parent task and hands each finished one to `onResults` exactly once.
 * Delivery is deduplicated against `data-subagent-results` parts already in
 * the conversation, so notifications survive webview reloads without being
 * delivered twice.
 */
export function useBackgroundSubtaskResults(
  taskId: string,
  messages: Message[],
  onResults: (results: SubAgentResultNotification[]) => void,
) {
  const store = useDefaultStore();
  const subTasks = store.useQuery(catalog.queries.makeSubTaskQuery(taskId));

  const onResultsRef = useRef(onResults);
  onResultsRef.current = onResults;

  // Guards against redelivery while a notification is still queued (not yet
  // part of the conversation).
  const deliveredRef = useRef(new Set<string>());

  useEffect(() => {
    // Keyed by taskId:status so a retried task's new outcome notifies again.
    const notified = new Set<string>();
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === "data-subagent-results") {
          for (const result of part.data.results) {
            notified.add(`${result.taskId}:${result.status}`);
          }
        }
      }
    }

    const fresh = subTasks.filter(
      (task) =>
        task.background &&
        (task.status === "completed" || task.status === "failed") &&
        !notified.has(`${task.id}:${task.status}`) &&
        !deliveredRef.current.has(`${task.id}:${task.status}`),
    );
    if (fresh.length === 0) return;

    const results = fresh.map((task) => {
      deliveredRef.current.add(`${task.id}:${task.status}`);
      return createSubAgentResultNotification(store, task);
    });
    onResultsRef.current(results);
  }, [subTasks, messages, store]);
}
