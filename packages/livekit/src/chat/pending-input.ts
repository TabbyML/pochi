import { prompts } from "@getpochi/common";
import {
  isAssistantMessageWithNoToolCalls,
  isAssistantMessageWithStreamingParts,
} from "@getpochi/common/message-utils";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { isAwaitingFollowupAnswer } from "../task-utils";
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

/**
 * How a user's message reached the agent, which decides the reminder that
 * frames it:
 *
 * - `while-working`: it rode along with a request the agent was already
 *   making, so the agent is still on its task.
 * - `after-interruption`: the agent's previous response was cut short, so the
 *   agent needs to continue from an unfinished response rather than to start
 *   a new turn.
 */
export type UserInputDelivery = "while-working" | "after-interruption";

/** Concatenates the parts of the inputs, in queue order. */
export function getQueuedUserInputParts(
  inputs: readonly QueuedUserInput[],
): Message["parts"] {
  return inputs.flatMap((input) => input.parts);
}

/**
 * Parts to attach for queued user input, framed by how it was delivered. The
 * reminder comes first, so the agent reads how to take the input before the
 * input itself.
 *
 * @returns no reminder for input that reached the agent as an ordinary new
 * turn, and the input's own parts when there is nothing queued.
 */
export function getUserInputPartsForDelivery(
  inputs: readonly QueuedUserInput[],
  delivery?: UserInputDelivery,
): Message["parts"] {
  const parts = getQueuedUserInputParts(inputs);
  if (parts.length === 0 || delivery === undefined) return parts;

  const reminder =
    delivery === "while-working"
      ? prompts.userInputWhileWorking
      : prompts.userInputAfterInterruption;
  return [
    { type: "text", text: prompts.createSystemReminder(reminder) },
    ...parts,
  ];
}

/**
 * Whether the last assistant turn was cut short, e.g. by the user stopping it
 * or steering: its text never finished streaming, or it left a tool call
 * without a result. Such a response is what the model sees as unfinished work
 * to pick up.
 *
 * A turn that ended on a follow-up question is not interrupted: it handed the
 * conversation back to the user on purpose.
 */
export function isInterruptedAssistantResponse(message?: Message): boolean {
  if (message?.role !== "assistant") return false;
  if (isAwaitingFollowupAnswer(message)) return false;
  if (isAssistantMessageWithStreamingParts(message)) return true;

  // A last step without tool calls is a finished answer, even when the turn
  // ended on plain text.
  return (
    !isAssistantMessageWithNoToolCalls(message) &&
    !lastAssistantMessageIsCompleteWithToolCalls({ messages: [message] })
  );
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
