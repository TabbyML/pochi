import type { Message } from "@getpochi/livekit";

const RedactedMessage = "[FILE CONTENT REDACTED]";

/**
 * Sanitize sensitive content from tool calls in a message
 * This removes or redacts sensitive information like file contents and diff content
 */
export function sanitizeMessage(message: Message): Message {
  return {
    ...message,
    parts: message.parts.map((part) => {
      if (part.type === "tool-readFile" && part.output) {
        const output = part.output;

        if ("type" in output && output.type === "media") {
          return {
            ...part,
            output: {
              ...output,
              data: RedactedMessage,
            },
          };
        }

        return {
          ...part,
          output: {
            ...output,
            content: RedactedMessage,
          },
        };
      }

      if (
        part.type === "tool-applyDiff" &&
        (part.input?.searchContent || part.input?.replaceContent)
      ) {
        return {
          ...part,
          input: {
            ...part.input,
            searchContent: RedactedMessage,
            replaceContent: RedactedMessage,
          },
        };
      }

      return part;
    }) as Message["parts"],
  };
}
