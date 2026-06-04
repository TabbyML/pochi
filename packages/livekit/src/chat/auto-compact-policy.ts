import { constants, prompts } from "@getpochi/common";
import type { Message, RequestData, Task } from "../types";

export const MaxSummaryOutputTokens = 20_000;

export const AutoCompactBufferTokens = 13_000;

export const MaxConsecutiveAutoCompactFailures = 3;

export function getAutoCompactThreshold(contextWindow: number): number {
  const effective = Math.max(contextWindow - MaxSummaryOutputTokens, 0);
  return Math.max(effective - AutoCompactBufferTokens, 0);
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
}: {
  messages: Message[];
  llm: RequestData["llm"] | undefined;
  task: Task | null | undefined;
}): boolean {
  const lastMessage = messages.at(-1);
  if (lastMessage?.role !== "user") return false;

  if (
    lastMessage.metadata?.kind === "user" &&
    lastMessage.metadata.compact === true
  ) {
    return false;
  }

  const totalTokens = task?.totalTokens ?? 0;
  if (totalTokens < constants.CompactTaskMinTokens) return false;

  const contextWindow = resolveContextWindow(llm);
  if (totalTokens < getAutoCompactThreshold(contextWindow)) {
    return false;
  }

  if (
    lastMessage.parts.some(
      (part) => part.type === "text" && prompts.isCompact(part.text),
    )
  ) {
    return false;
  }

  return true;
}
