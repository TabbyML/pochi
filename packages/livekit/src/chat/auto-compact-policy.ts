import { constants, prompts } from "@getpochi/common";
import { isStaticToolUIPart } from "ai";
import type { Message, RequestData, Task } from "../types";

export const MaxSummaryOutputTokens = 20_000;

export const AutoCompactBufferTokens = 13_000;

// Most models degrade on agentic tasks well before very large declared
// windows are exhausted. When no effectiveContextWindow is configured, cap
// auto-compaction at this token count.
export const DefaultEffectiveContextWindow = 160_000;

export const MaxConsecutiveAutoCompactFailures = 3;

export function getAutoCompactThreshold(
  contextWindow: number,
  effectiveContextWindow?: number,
): number {
  const window = Math.min(
    effectiveContextWindow ?? DefaultEffectiveContextWindow,
    contextWindow,
  );
  return Math.max(window - MaxSummaryOutputTokens - AutoCompactBufferTokens, 0);
}

function resolveContextWindow(llm: RequestData["llm"] | undefined): {
  contextWindow: number;
  effectiveContextWindow?: number;
} {
  const declared =
    llm && "contextWindow" in llm ? llm.contextWindow : undefined;
  const effective =
    llm && "effectiveContextWindow" in llm
      ? llm.effectiveContextWindow
      : undefined;
  return {
    contextWindow: declared || constants.DefaultContextWindow,
    effectiveContextWindow: effective,
  };
}

export function shouldAutoCompact({
  messages,
  llm,
  task,
  estimatedTotalTokens,
}: {
  messages: Message[];
  llm: RequestData["llm"] | undefined;
  task: Task | null | undefined;
  estimatedTotalTokens?: number;
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

  const { contextWindow, effectiveContextWindow } = resolveContextWindow(llm);
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
