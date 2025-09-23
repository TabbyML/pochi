import { isAutoApproveTool, isUserInputToolPart } from "@getpochi/tools";
import { type UIMessage, getToolName, isToolUIPart } from "ai";
import { clone } from "remeda";
import { KnownTags } from "./constants";
import { prompts } from "./prompts";

function resolvePendingToolCalls(
  messages: UIMessage[],
  resolveLastMessage = false,
): UIMessage[] {
  return messages.map((message, index) => {
    if (
      (resolveLastMessage ? true : index < messages.length - 1) &&
      message.role === "assistant"
    ) {
      const parts = message.parts.map((part) => {
        if (
          isToolUIPart(part) &&
          part.state !== "output-available" &&
          part.state !== "output-error"
        ) {
          const isSuccess =
            isUserInputToolPart(part) || isAutoApproveTool(part);
          return {
            ...part,
            state: "output-available",
            output: isSuccess
              ? { success: true }
              : { error: "User cancelled the tool call." },
          } satisfies UIMessage["parts"][number];
        }
        return part;
      });
      return {
        ...message,
        parts,
      };
    }

    return message;
  });
}

function stripKnownXMLTags(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    const parts = message.parts.map((part) => {
      if (part.type === "text") {
        const text = KnownTags.reduce((acc, tag) => {
          return acc.replace(
            new RegExp(`<${tag}[^>]*>(.*?)<\/${tag}>`, "gs"),
            "$1",
          );
        }, part.text);
        return {
          ...part,
          text,
        };
      }
      return part;
    });
    return {
      ...message,
      parts,
    };
  });
}

function removeSystemReminder(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => {
    if (message.role !== "user") return true;
    const parts = message.parts.filter((part) => {
      if (part.type !== "text") return true;
      return !prompts.isSystemReminder(part.text);
    });
    message.parts = parts;
    if (parts.some((x) => x.type === "text" || isToolUIPart(x))) {
      return true;
    }
    return false;
  });
}

function combineConsecutiveAssistantMessages(
  messages: UIMessage[],
): UIMessage[] {
  for (let i = 0; i < messages.length - 1; i++) {
    if (
      messages[i].role === "assistant" &&
      messages[i + 1].role === "assistant"
    ) {
      messages[i].parts.push(...messages[i + 1].parts);
      messages.splice(i + 1, 1);
      i--;
    }
  }

  return messages;
}

function removeEmptyMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => message.parts.length > 0);
}

function removeMessagesWithoutTextOrToolCall(
  messages: UIMessage[],
): UIMessage[] {
  return messages.filter((message) => {
    return message.parts.some((part) => {
      return part.type === "text" || isToolUIPart(part);
    });
  });
}

function removeToolCallArgumentMetadata(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    message.parts = message.parts.map((part) => {
      if (
        isToolUIPart(part) &&
        typeof part.input === "object" &&
        part.input &&
        "_meta" in part.input
      ) {
        // biome-ignore lint/performance/noDelete: need delete to make zod happy
        delete part.input._meta;
      }
      return part;
    });
    return message;
  });
}

function removeToolCallArgumentTransientData(
  messages: UIMessage[],
): UIMessage[] {
  return messages.map((message) => {
    message.parts = message.parts.map((part) => {
      if (
        isToolUIPart(part) &&
        typeof part.input === "object" &&
        part.input &&
        "_transient" in part.input
      ) {
        // biome-ignore lint/performance/noDelete: need delete to make zod happy
        delete part.input._transient;
      }
      return part;
    });
    return message;
  });
}

function removeToolCallResultMetadata(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    message.parts = message.parts.map((part) => {
      if (
        isToolUIPart(part) &&
        part.state === "output-available" &&
        typeof part.output === "object" &&
        part.output &&
        "_meta" in part.output
      ) {
        // biome-ignore lint/performance/noDelete: need delete to make zod happy
        delete part.output._meta;
      }
      return part;
    });
    return message;
  });
}

function removeInvalidCharForStorage(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    message.parts = message.parts.map((part) => {
      if (
        isToolUIPart(part) &&
        getToolName(part) === "executeCommand" &&
        part.state === "output-available"
      ) {
        const output = part.output;
        if (
          typeof output === "object" &&
          output &&
          "output" in output &&
          typeof output.output === "string"
        ) {
          // biome-ignore lint/suspicious/noControlCharactersInRegex: remove invalid characters
          output.output = output.output.replace(/\u0000/g, "");
        }
      }
      return part;
    });
    return message;
  });
}

function extractCompactMessages(messages: UIMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (
      message.parts.some((x) => x.type === "text" && prompts.isCompact(x.text))
    ) {
      return messages.slice(i);
    }
  }
  return messages;
}

type FormatOp = (messages: UIMessage[]) => UIMessage[];
const LLMFormatOps: FormatOp[] = [
  removeEmptyMessages,
  extractCompactMessages,
  removeMessagesWithoutTextOrToolCall,
  resolvePendingToolCalls,
  stripKnownXMLTags,
  removeToolCallResultMetadata,
  removeToolCallArgumentMetadata,
  removeToolCallArgumentTransientData,
];
const UIFormatOps = [
  resolvePendingToolCalls,
  removeSystemReminder,
  combineConsecutiveAssistantMessages,
];
const StorageFormatOps = [
  removeEmptyMessages,
  removeInvalidCharForStorage,
  removeToolCallArgumentTransientData,
];

function formatMessages(messages: UIMessage[], ops: FormatOp[]): UIMessage[] {
  // Clone the messages to avoid mutating the original array.
  return ops.reduce((acc, op) => op(acc), clone(messages));
}

export interface LLMFormatterOptions {
  removeSystemReminder?: boolean;
}

export const formatters = {
  // Format messages for the Front-end UI rendering.
  ui: <T extends UIMessage>(messages: T[]) =>
    formatMessages(messages, UIFormatOps) as T[],

  // Format messages before sending them to the LLM.
  llm: <T extends UIMessage>(messages: T[], options?: LLMFormatterOptions) => {
    const llmFormatOps = [
      ...(options?.removeSystemReminder ? [removeSystemReminder] : []),
      ...LLMFormatOps,
    ];
    return formatMessages(messages, llmFormatOps) as T[];
  },

  // Format messages before storing them in the database.
  storage: (messages: UIMessage[]) =>
    formatMessages(messages, StorageFormatOps),
};
