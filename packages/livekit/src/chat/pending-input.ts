import type { Message } from "../types";
import type { BackgroundJobNotificationPart } from "./background-job-notification";

/** A user message waiting for the agent to be ready for it. */
export type QueuedUserInput = {
  id: string;
  parts: Message["parts"];
  /** Host data used to render or re-edit the input. Opaque to the kit. */
  display?: unknown;
};

/** Everything waiting to reach the model with the next request. */
export type PendingInput = {
  userInputs: readonly QueuedUserInput[];
  notifications: readonly BackgroundJobNotificationPart[];
};

/** Persists queued user inputs so they survive a host reload. */
export type QueuedUserInputStorage = {
  load: () => Promise<readonly QueuedUserInput[]>;
  save: (inputs: readonly QueuedUserInput[]) => Promise<void>;
};

export const EmptyPendingInput: PendingInput = {
  userInputs: [],
  notifications: [],
};

/** Concatenates the parts of the inputs, in queue order. */
export function getQueuedUserInputParts(
  inputs: readonly QueuedUserInput[],
): Message["parts"] {
  return inputs.flatMap((input) => input.parts);
}

/**
 * Adds user input parts to an outgoing message list: they extend the trailing
 * user message, or become a new user message after an assistant message.
 *
 * @returns the updated messages, or undefined when there is nothing to attach.
 */
export function attachUserInputParts(
  messages: readonly Message[],
  parts: Message["parts"],
): Message[] | undefined {
  if (parts.length === 0) return undefined;

  const lastMessage = messages.at(-1);
  if (lastMessage?.role === "user") {
    return [
      ...messages.slice(0, -1),
      { ...lastMessage, parts: [...lastMessage.parts, ...parts] },
    ];
  }

  return [...messages, { id: crypto.randomUUID(), role: "user", parts }];
}

/**
 * Takes user input parts back out of the message they were attached to, for a
 * request that failed before the conversation was persisted. A message left
 * without parts is removed.
 *
 * @returns the updated messages, or undefined when nothing was removed.
 */
export function detachUserInputParts(
  messages: readonly Message[],
  messageId: string,
  parts: Message["parts"],
): Message[] | undefined {
  const index = messages.findIndex((message) => message.id === messageId);
  if (index === -1 || parts.length === 0) return undefined;

  const message = messages[index];
  const remaining = [...message.parts];
  for (const part of parts) {
    const key = JSON.stringify(part);
    const at = remaining.findLastIndex(
      (item) => item === part || JSON.stringify(item) === key,
    );
    if (at !== -1) remaining.splice(at, 1);
  }
  if (remaining.length === message.parts.length) return undefined;

  const updated = [...messages];
  if (remaining.length === 0) updated.splice(index, 1);
  else updated[index] = { ...message, parts: remaining };
  return updated;
}
