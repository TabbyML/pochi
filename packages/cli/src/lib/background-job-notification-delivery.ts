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
 * Drains every pending background job event into a single user message.
 *
 * The pending list is emptied, so a notification is never delivered twice.
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
 * Delivers background jobs that finished while the step loop was running as
 * part of the continuation request the loop is about to send.
 *
 * Without this the model only learns about them once the whole task ends,
 * which is both slow and often too late to be actionable. Riding along with
 * the continuation keeps the request count unchanged.
 */
export function deliverBackgroundJobNotifications(
  stepResult: StepResult,
  pending: BackgroundJobTerminalEvent[],
  chat: BackgroundJobNotificationTarget,
): boolean {
  // "retry" resends the last message as is, so injecting a notification would
  // change what is being retried. "finished" drains separately because it also
  // has to decide whether one more step is needed.
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
