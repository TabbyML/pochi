import type { ExtendedUIMessage } from "@ragdoll/db";
import { isAutoApproveTool, isUserInputTool } from "@ragdoll/tools";
import { type ToolSet, type UIMessage, convertToCoreMessages } from "ai";
import { clone } from "remeda";
import { KnownTags } from "./constants";
import { prompts } from "./prompts";

export function resolvePendingToolCalls(messages: UIMessage[]): UIMessage[] {
  return messages.map((message, index) => {
    if (index < messages.length - 1 && message.role === "assistant") {
      const parts = message.parts.map((part) => {
        if (
          part.type === "tool-invocation" &&
          part.toolInvocation.state !== "result"
        ) {
          return {
            ...part,
            toolInvocation: {
              ...part.toolInvocation,
              state: "result",
              result: {
                error:
                  isUserInputTool(part.toolInvocation.toolName) ||
                  isAutoApproveTool(part.toolInvocation.toolName)
                    ? { success: true }
                    : "User cancelled the tool call.",
              },
            },
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

export function removeDeprecatedToolInvocations(
  messages: UIMessage[],
): UIMessage[] {
  return messages.map((message) => {
    message.toolInvocations = undefined;
    return message;
  });
}

export function stripKnownXMLTags(messages: UIMessage[]): UIMessage[] {
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

export function removeSystemReminder(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => {
    if (message.role !== "user") return true;
    const parts = message.parts.filter((part) => {
      if (part.type !== "text") return true;
      return !prompts.isSystemReminder(part.text);
    });
    message.parts = parts;
    if (parts.some((x) => x.type === "text" || x.type === "tool-invocation")) {
      return true;
    }
    return false;
  });
}

export function combineConsecutiveAssistantMessages(
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

function removeContentInMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    message.content = "";
    return message;
  });
}

function removeCheckpointPart(messages: ExtendedUIMessage[]): UIMessage[] {
  return messages.map((x) => {
    x.parts = x.parts.filter((y) => y.type !== "checkpoint");
    return x;
  }) as UIMessage[];
}

function removeEmptyMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => message.parts.length > 0);
}

function removeReasoningParts(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    message.parts = message.parts.filter((part) => {
      return part.type !== "reasoning";
    });
    return message;
  });
}

function removeMessagesWithoutTextOrFunctionCall(
  messages: UIMessage[],
): UIMessage[] {
  return messages.filter((message) => {
    return message.parts.some((part) => {
      return part.type === "text" || part.type === "tool-invocation";
    });
  });
}

function removeToolCallArgumentMetadata(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    message.parts = message.parts.map((part) => {
      if (part.type === "tool-invocation") {
        if (part.toolInvocation.args._meta) {
          part.toolInvocation.args._meta = undefined;
        }
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
      if (part.type === "tool-invocation") {
        if (part.toolInvocation.args?._transient) {
          part.toolInvocation.args._transient = undefined;
        }
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
        part.type === "tool-invocation" &&
        part.toolInvocation.state === "result" &&
        part.toolInvocation.result &&
        part.toolInvocation.result._meta
      ) {
        part.toolInvocation.result._meta = undefined;
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
        part.type === "tool-invocation" &&
        part.toolInvocation.toolName === "executeCommand" &&
        "result" in part.toolInvocation
      ) {
        const result = part.toolInvocation.result;
        if (
          typeof result === "object" &&
          "output" in result &&
          typeof result.output === "string"
        ) {
          // biome-ignore lint/suspicious/noControlCharactersInRegex: remove invalid characters
          result.output = result.output.replace(/\u0000/g, "");
        }
      }
      return part;
    });
    return message;
  });
}

type FormatOp = (messages: UIMessage[]) => UIMessage[];
const LLMFormatOps: FormatOp[] = [
  removeEmptyMessages,
  removeMessagesWithoutTextOrFunctionCall,
  resolvePendingToolCalls,
  stripKnownXMLTags,
  removeToolCallResultMetadata,
  removeToolCallArgumentMetadata,
  removeToolCallArgumentTransientData,
  removeCheckpointPart,
];
const UIFormatOps = [
  resolvePendingToolCalls,
  removeSystemReminder,
  combineConsecutiveAssistantMessages,
  removeContentInMessages,
];
const StorageFormatOps = [
  removeDeprecatedToolInvocations,
  removeContentInMessages,
  removeEmptyMessages,
  removeInvalidCharForStorage,
  removeToolCallArgumentTransientData,
];

function formatMessages(messages: UIMessage[], ops: FormatOp[]): UIMessage[] {
  // Clone the messages to avoid mutating the original array.
  return ops.reduce((acc, op) => op(acc), clone(messages));
}

export const formatters = {
  // Format messages for the Front-end UI rendering.
  ui: (messages: UIMessage[]) => formatMessages(messages, UIFormatOps),

  // Format messages before sending them to the LLM.
  llm: (
    messages: UIMessage[],
    options?: {
      tools?: ToolSet;
      isGeminiOrPochi: boolean;
      removeSystemReminder?: boolean;
    },
  ) => {
    const llmFormatOps = [
      ...(options?.isGeminiOrPochi ? [removeReasoningParts] : []),
      ...(options?.removeSystemReminder ? [removeSystemReminder] : []),
      ...LLMFormatOps,
    ];
    const coreMessages = convertToCoreMessages(
      formatMessages(messages, llmFormatOps),
      {
        tools: options?.tools,
      },
    );

    const cacheControlMessage = coreMessages.at(-1);
    if (cacheControlMessage) {
      cacheControlMessage.providerOptions = {
        anthropic: { cacheControl: { type: "ephemeral" } },
      };
    }
    return coreMessages;
  },

  // Format messages before storing them in the database.
  storage: (messages: UIMessage[]) =>
    formatMessages(messages, StorageFormatOps),
};
