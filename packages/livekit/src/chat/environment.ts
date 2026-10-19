import {
  type Environment,
  extractCompactMessages,
  prompts,
} from "@getpochi/common";
import type { TextUIPart } from "ai";
import type { Message } from "../types";

function hasEnvironmentReminder(message: Message): boolean {
  return message.parts.some(
    (part) =>
      part.type === "text" && prompts.isEnvironmentSystemReminder(part.text),
  );
}

/**
 * Adds the environment to the request tail only, so the prompt prefix written
 * by earlier requests stays cacheable. Mutates the last user message in place
 * and returns a new array when a message has to be appended; callers must
 * store the result before the request snapshots its messages.
 */
export function injectEnvironment(
  messages: Message[],
  environment: Environment | undefined,
): Message[] {
  const lastMessage = messages.at(-1);
  if (environment === undefined || lastMessage === undefined) return messages;
  // Only the suffix from the latest compact block reaches the model.
  const completeEnvironmentVisible = extractCompactMessages(messages).some(
    (message) =>
      message.parts.some(
        (part) =>
          part.type === "text" && prompts.hasCompleteEnvironmentInfo(part.text),
      ),
  );

  if (lastMessage.role !== "user") {
    if (completeEnvironmentVisible) return messages;
    return [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [createEnvironmentReminderPart(environment, "full")],
      },
    ];
  }

  if (!hasEnvironmentReminder(lastMessage)) {
    lastMessage.parts = [
      createEnvironmentReminderPart(
        environment,
        completeEnvironmentVisible ? "lite" : "full",
      ),
      ...lastMessage.parts,
    ];
    return messages;
  }

  // A retry keeps the reminder from the earlier attempt even though it may be
  // stale: rewriting it would invalidate the prompt cache that attempt wrote.
  if (completeEnvironmentVisible) return messages;

  // A compaction since the earlier attempt hid the complete environment. Add it
  // to this message rather than a second consecutive user message.
  lastMessage.parts = [
    ...lastMessage.parts,
    createEnvironmentReminderPart(environment, "full"),
  ];
  return messages;
}

function createEnvironmentReminderPart(
  environment: Environment,
  kind: "full" | "lite",
): TextUIPart {
  const { gitStatus } = environment.workspace;
  const user =
    gitStatus?.userEmail && gitStatus?.userName
      ? {
          name: gitStatus.userName,
          email: gitStatus.userEmail,
        }
      : undefined;
  return {
    type: "text",
    text: prompts.createSystemReminder(
      kind === "full"
        ? prompts.environment(environment, user)
        : prompts.liteEnvironment(environment),
    ),
  };
}
