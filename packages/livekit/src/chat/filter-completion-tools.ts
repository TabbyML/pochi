import type { Message } from "../types";

// type A: attemptCompletion/askFollowupQuestion
// type B: toolcalls exclude todoWrite and attemptCompletion/askFollowupQuestion

// Rules:
// If there are both type A and B tool calls in the last step, remove all type A tool calls

export function filterCompletionTools(message: Message): Message {
  const lastStepStartIndex = message.parts.findLastIndex(
    (part) => part.type === "step-start",
  );
  const parts =
    lastStepStartIndex > 0
      ? message.parts.slice(lastStepStartIndex)
      : message.parts;

  const hasCompletionTools = parts.some(
    (part) =>
      part.type === "tool-attemptCompletion" ||
      part.type === "tool-askFollowupQuestion",
  );
  const hasOtherTools = parts.some(
    (part) =>
      part.type.startsWith("tool-") &&
      part.type !== "tool-todoWrite" &&
      part.type !== "tool-attemptCompletion" &&
      part.type !== "tool-askFollowupQuestion",
  );

  if (hasCompletionTools && hasOtherTools) {
    const lastStepParts = parts.filter(
      (part) =>
        part.type !== "tool-attemptCompletion" &&
        part.type !== "tool-askFollowupQuestion",
    );
    const prevStepsParts =
      lastStepStartIndex > 0 ? message.parts.slice(0, lastStepStartIndex) : [];
    return {
      ...message,
      parts: [...prevStepsParts, ...lastStepParts],
    };
  }

  return message;
}
