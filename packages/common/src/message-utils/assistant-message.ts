import {
  type ToolUIPart,
  type UIMessage,
  isStaticToolUIPart,
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
    .filter(isStaticToolUIPart);

  return message.parts.length > 0 && lastStepToolInvocations.length === 0;
}

export function isAssistantMessageWithEmptyParts(message: UIMessage): boolean {
  return message.role === "assistant" && message.parts.length === 0;
}

export function isAssistantMessageWithPartialToolCalls(lastMessage: UIMessage) {
  return (
    lastMessage.role === "assistant" &&
    lastMessage.parts.some(
      (part) => isStaticToolUIPart(part) && part.state === "input-streaming",
    )
  );
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A tool call is "invalid" when it ended in `output-error` state and neither
 * `input` nor `rawInput` is a plain object. This typically happens when the
 * model emitted malformed JSON tool arguments and the repair pass also failed:
 * the AI SDK then leaves `input: undefined` and `rawInput` as the raw
 * (non-JSON) string. Sending such a part to providers like Anthropic causes
 * `tool_use.input: Input should be a valid dictionary` and the conversation
 * gets stuck — every retry replays the same broken tool_use.
 */
function isInvalidToolCallPart(part: UIMessage["parts"][number]): boolean {
  if (!isStaticToolUIPart(part)) return false;
  if (part.state !== "output-error") return false;
  if (isPlainObject(part.input)) return false;
  const rawInput = (part as ToolUIPart & { rawInput?: unknown }).rawInput;
  return !isPlainObject(rawInput);
}

export function isAssistantMessageWithInvalidToolCalls(
  message: UIMessage,
): boolean {
  return (
    message.role === "assistant" && message.parts.some(isInvalidToolCallPart)
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
    // Roll back the last step if it contains an invalid tool call. The AI SDK
    // considers `output-error` parts "complete", so we have to detect the
    // malformed-input case explicitly to avoid an infinite retry loop where
    // the same broken `tool_use` is sent to the provider every time.
    if (!isAssistantMessageWithInvalidToolCalls(message)) {
      if (
        lastAssistantMessageIsCompleteWithToolCalls({ messages: [message] })
      ) {
        return message;
      }

      if (isAssistantMessageWithNoToolCalls(message)) {
        return message;
      }
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
