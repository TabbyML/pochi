import {
  type UIMessage,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
export function isAssistantMessageWithNoToolCalls(message: UIMessage): boolean {
  if (message.role !== "assistant") {
    return false;
  }

  const lastStepStartIndex = message.parts.reduce((lastIndex, part, index) => {
    return part.type === "step-start" ? index : lastIndex;
  }, -1);

  const lastStepToolInvocations = message.parts
    .slice(lastStepStartIndex + 1)
    .filter(isToolUIPart);

  return message.parts.length > 0 && lastStepToolInvocations.length === 0;
}

export function isAssistantMessageWithEmptyParts(message: UIMessage): boolean {
  return message.role === "assistant" && message.parts.length === 0;
}

export function isAssistantMessageWithOutputError(message: UIMessage): boolean {
  return (
    message.role === "assistant" &&
    message.parts.some(
      (part) => isToolUIPart(part) && part.state === "output-error",
    )
  );
}

export function isAssistantMessageWithPartialToolCalls(lastMessage: UIMessage) {
  return (
    lastMessage.role === "assistant" &&
    lastMessage.parts.some(
      (part) => isToolUIPart(part) && part.state === "input-streaming",
    )
  );
}

export function prepareLastMessageForRetry<T extends UIMessage>(
  lastMessage: T,
): T | null {
  const message = {
    ...lastMessage,
    parts: [...lastMessage.parts],
  };

  do {
    if (lastAssistantMessageIsCompleteWithToolCalls({ messages: [message] })) {
      return message;
    }

    if (isAssistantMessageWithNoToolCalls(message)) {
      return message;
    }

    const lastStepStartIndex = message.parts.findLastIndex(
      (part) => part.type === "step-start",
    );

    message.parts = message.parts.slice(0, lastStepStartIndex);
  } while (message.parts.length > 0);

  return null;
}

/**
 * Fixes common issues in AI-generated text content
 */
const TrimStrings = ["\\\n", "\\"];
const WrapStrings = ["```", "'''", '"""'];

export function fixCodeGenerationOutput(text: string): string {
  if (!text) {
    return text;
  }

  let processed = text;

  // Remove special characters and code block delimiters at start and end
  for (const str of TrimStrings) {
    if (processed.startsWith(str)) {
      processed = processed.substring(str.length);
    }
    if (processed.endsWith(str)) {
      processed = processed.substring(0, processed.length - str.length);
    }
  }

  for (const str of WrapStrings) {
    if (processed.startsWith(str) && processed.endsWith(str)) {
      processed = processed.substring(
        str.length,
        processed.length - str.length,
      );
    }
  }

  return processed;
}
