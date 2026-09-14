import { BackgroundJobNotification } from "@getpochi/common";
import type { Message } from "../types";

type MessagePart = Message["parts"][number];

export type BackgroundJobNotificationPart = Extract<
  MessagePart,
  { type: "data-background-job-notification" }
>;

export type BackgroundNotificationPart = BackgroundJobNotificationPart;

export function dedupeBackgroundNotificationParts(
  parts: readonly BackgroundNotificationPart[],
  existing: readonly MessagePart[],
): BackgroundNotificationPart[] {
  const seen = new Set(getBackgroundJobNotificationIds(existing));
  return parts.filter((part) => {
    const id = part.data.notificationId;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/** Wraps notifications into the message parts hosts queue and send. */
export function toBackgroundJobNotificationParts(
  notifications: readonly BackgroundJobNotification[],
): BackgroundJobNotificationPart[] {
  return notifications.map((data) => ({
    type: "data-background-job-notification",
    data: BackgroundJobNotification.parse(data),
  }));
}

export function getBackgroundJobNotificationParts(
  parts: readonly MessagePart[],
): BackgroundJobNotificationPart[] {
  return parts.filter(
    (part): part is BackgroundJobNotificationPart =>
      part.type === "data-background-job-notification",
  );
}

export function getBackgroundJobNotificationIds(
  parts: readonly MessagePart[],
): string[] {
  return getBackgroundJobNotificationParts(parts).map(
    (part) => part.data.notificationId,
  );
}

/** Builds the user message used when notifications cannot ride along. */
export function createBackgroundJobNotificationMessage(
  parts: readonly BackgroundNotificationPart[],
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
  parts: readonly BackgroundNotificationPart[],
): Message[] | undefined {
  const pending = dedupeBackgroundNotificationParts(
    parts,
    messages.flatMap((message) => message.parts),
  );
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
