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

/** Whether restoring the visible environment requires a new message. */
export function shouldAppendEnvironmentMessage(messages: UIMessage[]): boolean {
  const lastMessage = messages.at(-1);
  return Boolean(
    lastMessage &&
      (lastMessage.role !== "user" || hasEnvironmentReminder(lastMessage)) &&
      !hasCompleteEnvironmentPrompt(getVisibleMessages(messages)),
  );
}

export function injectEnvironment(
  messages: UIMessage[],
  environment: Environment | undefined,
): UIMessage[] {
  if (environment === undefined) return messages;
  const lastMessage = messages.at(-1);
  if (shouldAppendEnvironmentMessage(messages)) {
    return [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [createEnvironmentReminderPart(environment, "full")],
      },
    ];
  }
  if (lastMessage?.role !== "user" || hasEnvironmentReminder(lastMessage)) {
    return messages;
  }
  const completeEnvironmentVisible = hasCompleteEnvironmentPrompt(
    getVisibleMessages(messages),
  );

  // The latest user message is persisted together with the request
  // (`chatStreamStarted`), so mutating it keeps the in-memory chat state and
  // the store in sync.
  lastMessage.parts = [
    createEnvironmentReminderPart(
      environment,
      completeEnvironmentVisible ? "lite" : "full",
    ),
    ...lastMessage.parts,
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
