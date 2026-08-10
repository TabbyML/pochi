import { constants, prompts } from "@getpochi/common";
import { isStaticToolUIPart } from "ai";
import type { Message, RequestData, Task } from "../types";

export const MaxSummaryOutputTokens = 20_000;

export const AutoCompactBufferTokens = 13_000;

export const MaxConsecutiveAutoCompactFailures = 3;

export function getAutoCompactThreshold(
  contextWindow: number,
  effectiveContextWindow?: number,
): number {
  // The effective window is the point where auto-compaction triggers. When the
  // model's real context window is too small to hold that point plus the
  // summary output, back off so the compaction request itself doesn't overflow.
  const triggerPoint =
    effectiveContextWindow ?? constants.DefaultEffectiveContextWindow;
  const bufferLimit =
    contextWindow - MaxSummaryOutputTokens - AutoCompactBufferTokens;
  return Math.max(Math.min(triggerPoint, bufferLimit), 0);
}

function resolveContextWindow(llm: RequestData["llm"] | undefined): number {
  const declared =
    llm && "contextWindow" in llm ? llm.contextWindow : undefined;
  return declared || constants.DefaultContextWindow;
}

export function shouldAutoCompact({
  messages,
  llm,
  task,
  estimatedTotalTokens,
  effectiveContextWindow,
}: {
  messages: Message[];
  llm: RequestData["llm"] | undefined;
  task: Task | null | undefined;
  estimatedTotalTokens?: number;
  effectiveContextWindow?: number;
}): boolean {
  const attachIndex = findAutoCompactAttachIndex(messages);
  if (attachIndex === undefined) return false;

  const attachMessage = messages[attachIndex];

  if (
    attachMessage?.metadata?.kind === "user" &&
    attachMessage.metadata.compact === true
  ) {
    return false;
  }

  if (!task && estimatedTotalTokens === undefined) return false;

  const totalTokens = Math.max(
    task?.totalTokens ?? 0,
    estimatedTotalTokens ?? 0,
  );
  if (totalTokens < constants.CompactTaskMinTokens) return false;

  const contextWindow = resolveContextWindow(llm);
  if (
    totalTokens < getAutoCompactThreshold(contextWindow, effectiveContextWindow)
  ) {
    return false;
  }

  if (
    messages
      .slice(attachIndex)
      .some((message) =>
        message.parts.some(
          (part) => part.type === "text" && prompts.isCompact(part.text),
        ),
      )
  ) {
    return false;
  }

  return true;
}

export function findAutoCompactAttachIndex(
  messages: Message[],
): number | undefined {
  const lastMessage = messages.at(-1);
  if (!lastMessage) return;

  if (lastMessage.role === "user") {
    return messages.length - 1;
  }

  if (!isCompleteAssistantToolResultMessage(lastMessage)) {
    return;
  }

  const previousUserIndex = messages.findLastIndex(
    (message, index) => index < messages.length - 1 && message.role === "user",
  );
  return previousUserIndex === -1 ? undefined : previousUserIndex;
}

function isCompleteAssistantToolResultMessage(message: Message): boolean {
  if (message.role !== "assistant") return false;

  const toolParts = message.parts.filter(isStaticToolUIPart);
  return (
    toolParts.length > 0 &&
    toolParts.every(
      (part) =>
        part.state === "output-available" || part.state === "output-error",
    )
  );
}
