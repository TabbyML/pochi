import { type Environment, prompts } from "@getpochi/common";
import type { TextUIPart, UIMessage } from "ai";

function getVisibleMessages(messages: UIMessage[]): UIMessage[] {
  // The LLM formatter discards every message before the latest compact block.
  // Only inspect that visible suffix when deciding whether the request already
  // contains a complete environment.
  const compactIndex = messages.findLastIndex((message) =>
    message.parts.some(
      (part) => part.type === "text" && prompts.isCompact(part.text),
    ),
  );
  return messages.slice(Math.max(compactIndex, 0));
}

function hasEnvironmentReminder(message: UIMessage): boolean {
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
  messages: UIMessage[],
  environment: Environment | undefined,
): UIMessage[] {
  const lastMessage = messages.at(-1);
  if (environment === undefined || lastMessage === undefined) return messages;
  const completeEnvironmentVisible = hasCompleteEnvironmentPrompt(
    getVisibleMessages(messages),
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

function hasCompleteEnvironmentPrompt(messages: UIMessage[]): boolean {
  return messages.some((message) =>
    message.parts.some(
      (part) =>
        part.type === "text" && prompts.hasCompleteEnvironmentInfo(part.text),
    ),
  );
}
