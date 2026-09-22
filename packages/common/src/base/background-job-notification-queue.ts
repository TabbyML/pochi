import type {
  BackgroundJobNotification,
  BackgroundMonitorNotification,
} from "./message";
import { MonitorMaxBatchCharacters, MonitorMaxLinesPerBatch } from "./monitor";

type MonitorQueueEntry = BackgroundMonitorNotification & { buffered?: true };

/** Only monitor notifications can carry an unpublished output accumulator. */
export type BackgroundJobNotificationQueueEntry =
  | Exclude<BackgroundJobNotification, BackgroundMonitorNotification>
  | MonitorQueueEntry;

/**
 * All job notifications share one queue. Each monitor retains an immutable
 * published head and one bounded accumulator, sealed when the monitor ends.
 */
export function enqueueBackgroundJobNotification(
  queue: readonly BackgroundJobNotificationQueueEntry[],
  notification: BackgroundJobNotification,
): BackgroundJobNotificationQueueEntry[] {
  if (queue.some((item) => item.notificationId === notification.notificationId))
    return [...queue];
  if (notification.kind !== "monitor") return [...queue, notification];

  const existing = queue.filter(
    (item): item is MonitorQueueEntry =>
      item.kind === "monitor" &&
      item.backgroundJobId === notification.backgroundJobId,
  );
  if (existing.some((item) => item.ended)) return [...queue];
  const buffered = existing.find((item) => item.buffered);
  const next = boundMonitor({
    ...notification,
    ...(existing.length && !notification.ended
      ? { buffered: true as const }
      : {}),
    ...(buffered
      ? {
          notificationId: buffered.notificationId,
          lines: [...buffered.lines, ...notification.lines],
          omittedLines:
            (buffered.omittedLines ?? 0) + (notification.omittedLines ?? 0),
        }
      : {}),
  });
  return buffered
    ? queue.map((item) => (item === buffered ? next : item))
    : [...queue, next];
}

/** Acknowledging a published monitor head promotes its accumulator with the same ID. */
export function acknowledgeBackgroundJobNotification(
  queue: readonly BackgroundJobNotificationQueueEntry[],
  notificationId: string,
): BackgroundJobNotificationQueueEntry[] {
  const acknowledged = queue.find(
    (item) =>
      item.notificationId === notificationId &&
      (item.kind !== "monitor" || !item.buffered),
  );
  if (!acknowledged) return [...queue];
  const remaining = queue.filter((item) => item !== acknowledged);
  if (acknowledged.kind !== "monitor") return remaining;
  const jobId = acknowledged.backgroundJobId;
  if (
    remaining.some(
      (item) =>
        item.kind === "monitor" &&
        item.backgroundJobId === jobId &&
        !item.buffered,
    )
  )
    return remaining;
  return remaining.map((item) => {
    if (
      item.kind !== "monitor" ||
      item.backgroundJobId !== jobId ||
      !item.buffered
    )
      return item;
    const { buffered, ...published } = item;
    return published;
  });
}

function boundMonitor(notification: MonitorQueueEntry): MonitorQueueEntry {
  const lines = [...notification.lines];
  let characters = lines.reduce((count, line) => count + line.length, 0);
  let omittedLines = notification.omittedLines ?? 0;
  while (
    lines.length > MonitorMaxLinesPerBatch ||
    characters > MonitorMaxBatchCharacters
  ) {
    characters -= lines.shift()?.length ?? 0;
    omittedLines++;
  }
  return { ...notification, lines, ...(omittedLines ? { omittedLines } : {}) };
}

/** Mutable accumulators never escape to notification consumers. */
export function getPendingBackgroundJobNotifications(
  queue: readonly BackgroundJobNotificationQueueEntry[],
): BackgroundJobNotification[] {
  return queue.filter((item) => item.kind !== "monitor" || !item.buffered);
}
