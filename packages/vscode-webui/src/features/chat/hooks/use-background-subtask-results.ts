import { useDefaultStore } from "@/lib/use-default-store";
import type { SubAgentResultNotification } from "@getpochi/common";
import {
  type Message,
  catalog,
  createSubAgentResultNotification,
} from "@getpochi/livekit";
import { useEffect, useRef } from "react";

/**
 * Watches background subagent tasks (newTask with background) of the
 * given parent task and enqueues finished results in the chat kit.
 * Delivery is deduplicated against `data-background-job-notification` parts already in
 * the conversation, so notifications survive webview reloads without being
 * delivered twice. The chat kit deduplicates results that are still pending.
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

  useEffect(() => {
    const notified = new Set(
      messages.flatMap((message) =>
        message.parts.flatMap((part) =>
          part.type === "data-background-job-notification"
            ? [part.data.notificationId]
            : [],
        ),
      ),
    );
    const results = subTasks
      .filter(
        (task) =>
          task.background &&
          (task.status === "completed" || task.status === "failed"),
      )
      .map((task) => createSubAgentResultNotification(store, task))
      .filter((notification) => !notified.has(notification.notificationId));
    if (results.length === 0) return;
    onResultsRef.current(results);
  }, [subTasks, messages, store]);
}
