import type { BackgroundJobNotification } from "@getpochi/common";
import type { DraftMessage } from "../hooks/use-chat-submit";

export function getBackgroundJobNotificationIds(
  message: Pick<DraftMessage, "parts">,
): string[] {
  return message.parts.flatMap((part) =>
    part.type === "data-background-job-notification"
      ? [part.data.notificationId]
      : [],
  );
}

/**
 * A queue entry that only carries background job notifications, i.e. it was
 * created by the notification queue rather than typed by the user.
 */
export function isBackgroundJobNotificationMessage(
  message: Pick<DraftMessage, "parts">,
): boolean {
  return (
    message.parts.length > 0 &&
    message.parts.every(
      (part) => part.type === "data-background-job-notification",
    )
  );
}

/**
 * Index of the queued notification that may be delivered in the middle of a
 * running agent loop, or `undefined` when nothing may be delivered yet.
 *
 * Only the head of the queue is eligible: queued user input keeps the running
 * loop untouched (steering it is an explicit user action), and delivering a
 * notification from behind a queued user message would reorder the queue.
 */
export function getDeliverableBackgroundJobNotificationIndex(
  messages: readonly Pick<DraftMessage, "parts">[],
): number | undefined {
  const head = messages[0];
  return head && isBackgroundJobNotificationMessage(head) ? 0 : undefined;
}

/**
 * Adds notifications to one non-removable queue entry. If a notification
 * entry is already waiting, new parts are merged into it so one dequeue sends
 * every notification available at that send point in a single user message.
 */
export function enqueueBackgroundJobNotifications(
  messages: DraftMessage[],
  notifications: readonly BackgroundJobNotification[],
): DraftMessage[] {
  const queuedIds = new Set(messages.flatMap(getBackgroundJobNotificationIds));
  const addedIds = new Set<string>();
  const pending = notifications.filter((notification) => {
    if (
      queuedIds.has(notification.notificationId) ||
      addedIds.has(notification.notificationId)
    ) {
      return false;
    }
    addedIds.add(notification.notificationId);
    return true;
  });
  if (pending.length === 0) return messages;

  const pendingParts = pending.map((notification) => ({
    type: "data-background-job-notification" as const,
    data: notification,
  }));
  const existingIndex = messages.findIndex(isBackgroundJobNotificationMessage);

  if (existingIndex === -1) {
    return [
      ...messages,
      {
        parts: pendingParts,
        raw: {
          text: pending.map((notification) => notification.summary).join("\n"),
          backgroundJobNotificationIds: pending.map(
            (notification) => notification.notificationId,
          ),
          nonRemovable: true,
        },
      },
    ];
  }

  const existing = messages[existingIndex];
  const parts = [...existing.parts, ...pendingParts];
  const updated = [...messages];
  updated[existingIndex] = {
    ...existing,
    parts,
    raw: {
      ...existing.raw,
      text: parts
        .flatMap((part) =>
          part.type === "data-background-job-notification"
            ? [part.data.summary]
            : [],
        )
        .join("\n"),
      backgroundJobNotificationIds: parts.flatMap((part) =>
        part.type === "data-background-job-notification"
          ? [part.data.notificationId]
          : [],
      ),
      nonRemovable: true,
    },
  };
  return updated;
}
