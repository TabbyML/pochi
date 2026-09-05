import type { BackgroundJobTerminalEvent } from "@getpochi/common";
import {
  type Message,
  createBackgroundJobNotificationMessage,
} from "@getpochi/livekit";

export type StepResult = "finished" | "next" | "retry";

export interface BackgroundJobNotificationTarget {
  appendOrReplaceMessage(message: Message): void;
}

/** Drains the pending events into one message. */
export function takeBackgroundJobNotificationMessage(
  pending: BackgroundJobTerminalEvent[],
): Message | undefined {
  const events = pending.splice(0);
  return events.length > 0
    ? createBackgroundJobNotificationMessage(events)
    : undefined;
}

/** Delivers jobs that finished mid loop with the next continuation request. */
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
