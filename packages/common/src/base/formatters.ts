import { isAutoSuccessToolPart } from "@getpochi/tools";
import { type ToolUIPart, type UIMessage, getToolName, isToolUIPart } from "ai";
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
          const isSuccess = isAutoSuccessToolPart(part);
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
    if (
      parts.some(
        (x) =>
          x.type === "text" ||
          x.type === "data-reviews" ||
          x.type === "data-bash-outputs" ||
          isToolUIPart(x),
      )
    ) {
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

function removeToolCallResultTransientData(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    message.parts = message.parts.map((part) => {
      if (
        isToolUIPart(part) &&
        part.state === "output-available" &&
        typeof part.output === "object" &&
        part.output &&
        "_transient" in part.output
      ) {
        // biome-ignore lint/performance/noDelete: need delete to make zod happy
        delete part.output._transient;
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

function removeEmptyTextParts(messages: UIMessage[]) {
  return messages.map((message) => {
    message.parts = message.parts.filter((part) => {
      if (part.type === "text" || part.type === "reasoning") {
        return part.text.trim().length > 0;
      }
      return true;
    });
    return message;
  });
}

function refineDetectedNewPromblems(messages: UIMessage[]) {
  const isWriteFileResultToolPart = (
    part: UIMessage["parts"][number],
  ): part is ToolUIPart<
    Record<
      string,
      {
        input: unknown;
        output: {
          newProblems?: string;
          _transient?: {
            resolvedProblems?: string;
          };
        };
      }
    >
  > & { state: "output-available" } => {
    return (
      isToolUIPart(part) &&
      (getToolName(part) === "writeToFile" ||
        getToolName(part) === "applyDiff") &&
      part.state === "output-available" &&
      typeof part.output === "object" &&
      part.output !== null
    );
  };

  const splitProblems = (input: string | undefined) => {
    if (!input) {
      return [];
    }
    return input
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
  };

  const findLastStepStartIndex = (
    parts: UIMessage["parts"],
    currentIndex: number,
  ) => {
    return parts
      .slice(0, currentIndex)
      .findLastIndex((p) => p.type === "step-start");
  };

  for (const message of messages) {
    for (let i = 0; i < message.parts.length; i++) {
      const part = message.parts[i];
      if (!isWriteFileResultToolPart(part)) {
        continue;
      }

      const resolvedProblems = splitProblems(
        part.output._transient?.resolvedProblems,
      );
      if (resolvedProblems.length === 0) {
        continue;
      }

      const lastStepStartIndex = findLastStepStartIndex(message.parts, i);

      for (const resolvedProblem of resolvedProblems) {
        for (let j = i - 1; j > lastStepStartIndex; j--) {
          const prevPart = message.parts[j];
          if (!isWriteFileResultToolPart(prevPart)) {
            continue;
          }

          const prevNewProblems = splitProblems(prevPart.output.newProblems);
          if (prevNewProblems.includes(resolvedProblem)) {
            const newProblems = prevNewProblems
              .filter((p) => p !== resolvedProblem)
              .join("\n")
              .trim();
            if (!newProblems) {
              // biome-ignore lint/performance/noDelete: remove newProblems
              delete prevPart.output.newProblems;
            } else {
              prevPart.output.newProblems = newProblems;
            }
            break;
          }
        }
      }
    }
  }

  return messages;
}

type FormatOp = (messages: UIMessage[]) => UIMessage[];
const LLMFormatOps: FormatOp[] = [
  removeEmptyTextParts,
  removeEmptyMessages,
  refineDetectedNewPromblems,
  extractCompactMessages,
  removeMessagesWithoutTextOrToolCall,
  resolvePendingToolCalls,
  stripKnownXMLTags,
  removeToolCallResultMetadata,
  removeToolCallResultTransientData,
  removeToolCallArgumentMetadata,
  removeToolCallArgumentTransientData,
];
const UIFormatOps = [
  removeEmptyTextParts,
  removeEmptyMessages,
  refineDetectedNewPromblems,
  resolvePendingToolCalls,
  removeSystemReminder,
  combineConsecutiveAssistantMessages,
];
const StorageFormatOps = [
  removeEmptyTextParts,
  removeEmptyMessages,
  refineDetectedNewPromblems,
  removeInvalidCharForStorage,
  removeToolCallArgumentTransientData,
  removeToolCallResultTransientData,
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
