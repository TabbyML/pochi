import { isAttemptTodoCompletionResolved } from "@/lib/todos-utils";
import {
  isAssistantMessageWithEmptyParts,
  isAssistantMessageWithNoToolCalls,
  isAssistantMessageWithPartialToolCalls,
} from "@getpochi/common/message-utils";
import type { Message } from "@getpochi/livekit";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useMemo } from "react";

type RetryKind = "ready" | "tool-calls" | "no-tool-calls";

export class ReadyForRetryError extends Error {
  kind: RetryKind;

  constructor(kind: RetryKind = "ready") {
    super();
    this.kind = kind;
  }
}

export function useMixinReadyForRetryError(
  messages: Message[],
  error?: Error,
): Error | undefined {
  const readyForRetryError = useMemo(() => {
    return getReadyForRetryError(messages);
  }, [messages]);

  return error || readyForRetryError;
}

export function getReadyForRetryError(messages: Message[]) {
  const lastMessage = messages.at(-1);
  if (!lastMessage) return;
  const attemptTodoCompletionPart =
    getLastAttemptTodoCompletionPart(lastMessage);
  if (attemptTodoCompletionPart) {
    const resolved = isAttemptTodoCompletionResolved(
      attemptTodoCompletionPart.output,
    );
    return resolved === false
      ? new ReadyForRetryError("tool-calls")
      : undefined;
  }
  if (lastMessage.role === "user") return new ReadyForRetryError();
  if (isAssistantMessageWithEmptyParts(lastMessage)) {
    return new ReadyForRetryError();
  }

  if (isAssistantMessageWithPartialToolCalls(lastMessage)) {
    return new ReadyForRetryError();
  }

  if (lastAssistantMessageIsCompleteWithToolCalls({ messages })) {
    return new ReadyForRetryError("tool-calls");
  }

  if (isAssistantMessageWithNoToolCalls(lastMessage)) {
    return new ReadyForRetryError("no-tool-calls");
  }
}

function getLastAttemptTodoCompletionPart(message: Message) {
  if (message.role !== "assistant") return undefined;

  const part = message.parts.at(-1);
  if (
    part?.type === "tool-newTask" &&
    part.state === "output-available" &&
    part.input?.agentType === "attemptTodoCompletion"
  ) {
    return part;
  }
}
