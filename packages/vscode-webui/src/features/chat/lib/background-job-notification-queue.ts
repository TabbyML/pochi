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
 * Only the head is deliverable mid loop: queued user input is sent by an
 * explicit steer, and delivering from behind it would reorder the queue.
 */
export function getDeliverableBackgroundJobNotificationIndex(
  messages: readonly Pick<DraftMessage, "parts">[],
): number | undefined {
  const head = messages[0];
  return head && isBackgroundJobNotificationMessage(head) ? 0 : undefined;
}

/** Merges notifications into one non-removable queue entry. */
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
