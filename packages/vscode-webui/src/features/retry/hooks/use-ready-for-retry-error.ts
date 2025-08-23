import {
  isAssistantMessageWithEmptyParts,
  isAssistantMessageWithNoToolCalls,
  isAssistantMessageWithOutputError,
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
    const lastMessage = messages.at(-1);
    if (!lastMessage) return;
    if (lastMessage.role === "user") return new ReadyForRetryError();
    if (isAssistantMessageWithEmptyParts(lastMessage)) {
      return new ReadyForRetryError();
    }

    if (
      isAssistantMessageWithPartialToolCalls(lastMessage) ||
      isAssistantMessageWithOutputError(lastMessage)
    ) {
      return new ReadyForRetryError();
    }

    if (lastAssistantMessageIsCompleteWithToolCalls({ messages })) {
      return new ReadyForRetryError("tool-calls");
    }

    if (isAssistantMessageWithNoToolCalls(lastMessage)) {
      return new ReadyForRetryError("no-tool-calls");
    }
  }, [messages]);

  return error || readyForRetryError;
}
