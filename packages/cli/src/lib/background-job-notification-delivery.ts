import type { BackgroundJobTerminalEvent } from "@getpochi/common";
import {
  type Message,
  createBackgroundJobNotificationMessage,
} from "@getpochi/livekit";

export type StepResult = "finished" | "next" | "retry";

export interface BackgroundJobNotificationTarget {
  appendOrReplaceMessage(message: Message): void;
}

/**
 * Drains every pending event into one user message, so a notification is
 * never delivered twice.
 */
export function takeBackgroundJobNotificationMessage(
  pending: BackgroundJobTerminalEvent[],
): Message | undefined {
  const events = pending.splice(0);
  return events.length > 0
    ? createBackgroundJobNotificationMessage(events)
    : undefined;
}

/**
 * Delivers jobs that finished mid loop as part of the continuation request
 * the loop is about to send, instead of only when the task ends.
 */
export function deliverBackgroundJobNotifications(
  stepResult: StepResult,
  pending: BackgroundJobTerminalEvent[],
  chat: BackgroundJobNotificationTarget,
): boolean {
  // "retry" resends the last message as is, and "finished" has its own drain.
  if (stepResult !== "next") {
    return false;
  }

  const message = takeBackgroundJobNotificationMessage(pending);
  if (!message) {
    return false;
  }

  chat.appendOrReplaceMessage(message);
  return true;
}
