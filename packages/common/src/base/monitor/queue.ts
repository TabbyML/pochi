import {
  type MonitorEventEnvelope,
  MonitorMaxBatchCharacters,
  MonitorMaxLinesPerBatch,
} from ".";

/** The unpublished accumulator is persisted explicitly so reloads preserve IDs. */
export interface MonitorEventQueueEntry extends MonitorEventEnvelope {
  buffered?: true;
}

/**
 * Each monitor has an immutable published head and one bounded accumulator.
 * On exit the accumulator is sealed and published alongside the head.
 * Legacy entries without `buffered` stay immutable until acknowledged.
 */
export function enqueueMonitorEvent(
  events: readonly MonitorEventQueueEntry[],
  event: MonitorEventEnvelope,
): MonitorEventQueueEntry[] {
  if (events.some((item) => item.notificationId === event.notificationId))
    return [...events];
  const existing = events.filter(
    (item) => item.backgroundJobId === event.backgroundJobId,
  );
  if (existing.some((item) => item.ended)) return [...events];
  const buffered = existing.find((item) => item.buffered);
  const next = boundEvent({
    ...event,
    ...(existing.length && !event.ended ? { buffered: true as const } : {}),
    ...(buffered
      ? {
          notificationId: buffered.notificationId,
          lines: [...buffered.lines, ...event.lines],
          omittedLines:
            (buffered.omittedLines ?? 0) + (event.omittedLines ?? 0),
        }
      : {}),
  });
  return buffered
    ? events.map((item) => (item === buffered ? next : item))
    : [...events, next];
}

/** Acknowledging the head publishes the accumulator without changing its ID. */
export function acknowledgeMonitorEvent(
  events: readonly MonitorEventQueueEntry[],
  notificationId: string,
): MonitorEventQueueEntry[] {
  const acknowledged = events.find(
    (item) => item.notificationId === notificationId && !item.buffered,
  );
  if (!acknowledged) return [...events];
  const remaining = events.filter((item) => item !== acknowledged);
  const jobId = acknowledged.backgroundJobId;
  if (
    remaining.some((item) => item.backgroundJobId === jobId && !item.buffered)
  )
    return remaining;
  return remaining.map((item) => {
    if (item.backgroundJobId !== jobId || !item.buffered) return item;
    const { buffered, ...published } = item;
    return published;
  });
}

function boundEvent(event: MonitorEventQueueEntry): MonitorEventQueueEntry {
  const lines = [...event.lines];
  let characters = lines.reduce((count, line) => count + line.length, 0);
  let omittedLines = event.omittedLines ?? 0;
  while (
    lines.length > MonitorMaxLinesPerBatch ||
    characters > MonitorMaxBatchCharacters
  ) {
    characters -= lines.shift()?.length ?? 0;
    omittedLines++;
  }
  return { ...event, lines, ...(omittedLines ? { omittedLines } : {}) };
}

/** Mutable accumulators must never escape to the notification consumers. */
export function getPendingMonitorEvents(
  events: readonly MonitorEventQueueEntry[],
): MonitorEventEnvelope[] {
  return events.filter((event) => !event.buffered);
}
