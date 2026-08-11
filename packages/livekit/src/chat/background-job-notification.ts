import {
  type BackgroundJobTerminalEvent,
  createBackgroundJobNotification,
} from "@getpochi/common";
import type { Message } from "../types";

export function createBackgroundJobNotificationMessage(
  events: readonly BackgroundJobTerminalEvent[],
): Message {
  if (events.length === 0) {
    throw new Error(
      "Cannot create a background job notification message without events.",
    );
  }

  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: events.map((event) => ({
      type: "data-background-job-notification" as const,
      data: createBackgroundJobNotification(event),
    })),
  };
}
