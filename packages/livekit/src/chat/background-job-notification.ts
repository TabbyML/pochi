import type {
  BackgroundJobNotification,
  MonitorEventEnvelope,
} from "@getpochi/common";
import type { Message } from "../types";

type MessagePart = Message["parts"][number];

export type BackgroundJobNotificationPart = Extract<
  MessagePart,
  { type: "data-background-job-notification" | "data-monitor-events" }
>;

/** Wraps notifications into the message parts hosts queue and send. */
export function toBackgroundJobNotificationParts(
  notifications: readonly (BackgroundJobNotification | MonitorEventEnvelope)[],
): BackgroundJobNotificationPart[] {
  return notifications.map((data) =>
    "lines" in data
      ? { type: "data-monitor-events", data: { batches: [data] } }
      : { type: "data-background-job-notification", data },
  );
}

export function getBackgroundJobNotificationParts(
  parts: readonly MessagePart[],
): BackgroundJobNotificationPart[] {
  return parts.filter(
    (part): part is BackgroundJobNotificationPart =>
      part.type === "data-background-job-notification" ||
      part.type === "data-monitor-events",
  );
}

export function getBackgroundJobNotificationIds(
  parts: readonly MessagePart[],
): string[] {
  return getBackgroundJobNotificationParts(parts).flatMap((part) =>
    part.type === "data-monitor-events"
      ? part.data.batches.map((batch) => batch.notificationId)
      : [part.data.notificationId],
  );
}

/** Builds the user message used when notifications cannot ride along. */
export function createBackgroundJobNotificationMessage(
  parts: readonly BackgroundJobNotificationPart[],
): Message {
  if (parts.length === 0) {
    throw new Error("Cannot create a notification message without parts");
  }

  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [...parts],
  };
}

/**
 * Adds pending notifications to an outgoing message list: they ride along with
 * a user message that is being sent anyway, and only become a message of their
 * own when the turn is started by the agent side.
 *
 * @returns the updated messages, or undefined when there is nothing to attach.
 */
export function attachBackgroundJobNotificationParts(
  messages: readonly Message[],
  parts: readonly BackgroundJobNotificationPart[],
): Message[] | undefined {
  const pending = dedupe(messages, parts);
  if (pending.length === 0) return undefined;

  const lastMessage = messages.at(-1);
  if (lastMessage?.role === "user") {
    return [
      ...messages.slice(0, -1),
      { ...lastMessage, parts: [...lastMessage.parts, ...pending] },
    ];
  }

  return [...messages, createBackgroundJobNotificationMessage(pending)];
}

/** Drops notifications already present in the conversation. */
function dedupe(
  messages: readonly Message[],
  parts: readonly BackgroundJobNotificationPart[],
): BackgroundJobNotificationPart[] {
  if (parts.length === 0) return [];

  const seen = new Set(
    messages.flatMap((message) =>
      getBackgroundJobNotificationIds(message.parts),
    ),
  );
  return parts.flatMap((part): BackgroundJobNotificationPart[] => {
    if (part.type === "data-monitor-events") {
      const batches = part.data.batches.filter((batch) => {
        if (seen.has(batch.notificationId)) return false;
        seen.add(batch.notificationId);
        return true;
      });
      return batches.length ? [{ ...part, data: { batches } }] : [];
    }
    if (seen.has(part.data.notificationId)) return [];
    seen.add(part.data.notificationId);
    return [part];
  });
}
