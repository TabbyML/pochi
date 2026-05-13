import { constants, prompts } from "@getpochi/common";
import type { Message, RequestData, Task } from "../types";

/** Threshold (fraction of context window) at which auto-compact triggers. */
export const AutoCompactContextWindowRatio = 0.9;

/** Decide whether the next request should be auto-compacted before sending. */
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

  // Skip the manual inline-compact path to avoid double-firing.
  if (
    lastMessage.metadata?.kind === "user" &&
    lastMessage.metadata.compact === true
  ) {
    return false;
  }

  const totalTokens = task?.totalTokens ?? 0;
  if (totalTokens < constants.CompactTaskMinTokens) return false;

  // Same convention as token-usage.tsx: vendor LLMs don't carry a
  // contextWindow on the request payload, so fall back to the default.
  const contextWindow =
    (llm && "contextWindow" in llm ? llm.contextWindow : undefined) ||
    constants.DefaultContextWindow;

  if (totalTokens < contextWindow * AutoCompactContextWindowRatio) {
    return false;
  }

  // Avoid stacking compact blocks on top of each other.
  if (
    lastMessage.parts.some(
      (part) => part.type === "text" && prompts.isCompact(part.text),
    )
  ) {
    return false;
  }

  return true;
}
