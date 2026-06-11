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
    const success = getAttemptTodoCompletionSuccess(
      attemptTodoCompletionPart.output,
    );
    return success === false ? new ReadyForRetryError("tool-calls") : undefined;
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

function getAttemptTodoCompletionSuccess(outputValue: unknown) {
  const output = unwrapJsonOutput(outputValue);
  const result =
    isRecord(output) && "result" in output
      ? unwrapJsonOutput(output.result)
      : undefined;

  for (const candidate of [result, output]) {
    if (
      isRecord(candidate) &&
      "success" in candidate &&
      typeof candidate.success === "boolean"
    ) {
      return candidate.success;
    }
  }
}

function unwrapJsonOutput(output: unknown): unknown {
  if (isRecord(output) && output.type === "json" && "value" in output) {
    return output.value;
  }

  if (typeof output === "string") {
    try {
      return JSON.parse(output);
    } catch {
      return output;
    }
  }

  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
