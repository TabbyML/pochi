import { isUserInputToolPart } from "@getpochi/tools";
import { isStaticToolUIPart } from "ai";
import type { Message } from "../types";

// Condition A: The last step contains completion tools (attemptCompletion or askFollowupQuestion).
// Condition B: The last step contains other functional tools.
// Rule:
// If both conditions are met, remove the completion tools. This prevents the agent from
// attempting to complete the task or ask a question while simultaneously performing other actions.
export function filterCompletionTools(message: Message): Message {
  const lastStepStartIndex = message.parts.findLastIndex(
    (part) => part.type === "step-start",
  );
  const parts =
    lastStepStartIndex > 0
      ? message.parts.slice(lastStepStartIndex)
      : message.parts;

  const hasCompletionTools = parts.some(isUserInputToolPart);
  const hasOtherTools = parts.some(
    (part) => isStaticToolUIPart(part) && !isUserInputToolPart(part),
  );

  if (hasCompletionTools && hasOtherTools) {
    const lastStepParts = parts.filter((part) => !isUserInputToolPart(part));
    const prevStepsParts =
      lastStepStartIndex > 0 ? message.parts.slice(0, lastStepStartIndex) : [];
    return {
      ...message,
      parts: [...prevStepsParts, ...lastStepParts],
    };
  }

  return message;
}
