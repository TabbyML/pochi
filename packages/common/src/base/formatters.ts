import {
  ResolvedAttemptTodoCompletionResult,
  isAutoSuccessToolPart,
  isTodoListResolved,
  isUserInputToolPart,
} from "@getpochi/tools";
import {
  type ToolUIPart,
  type UIMessage,
  getStaticToolName,
  isStaticToolUIPart,
} from "ai";
import { clone } from "remeda";
import { AttemptTodoCompletionAgentName, KnownTags } from "./constants";
import type { MessageMetadata } from "./message";
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
          isStaticToolUIPart(part) &&
          part.state !== "output-available" &&
          part.state !== "output-error"
        ) {
          const isSuccess = isAutoSuccessToolPart(part);
          const { approval: _approval, ...resolvedPart } = part;
          return {
            ...resolvedPart,
            // When input is null (input-streaming state), replace with empty object
            // to satisfy API requirements (e.g. Anthropic requires tool_use.input to be non-null)
            input: part.input ?? {},
            state: "output-available",
            output: getResolvedToolPartOutput(part, isSuccess),
          } as UIMessage["parts"][number];
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

function getResolvedToolPartOutput(
  part: ToolUIPart,
  isSuccess: boolean,
): unknown {
  if (!isSuccess) return { error: "User cancelled the tool call." };
  return getStaticToolName(part) === "renderWidget"
    ? { state: {} }
    : { success: true };
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
          (x.type === "text" && !prompts.isCompact(x.text)) ||
          x.type === "data-reviews" ||
          x.type === "data-bash-outputs" ||
          isStaticToolUIPart(x),
      )
    ) {
      return true;
    }
    // Keep messages that carry a compact checkpoint — the checkpoint
    // is meaningful UI content even when all other parts were system reminders.
    if (parts.some((x) => x.type === "text" && prompts.isCompact(x.text))) {
      return true;
    }
    return false;
  });
}

function isCompactOnlyUserMessage(message: UIMessage): boolean {
  if (message.role !== "user") return false;
  return message.parts.every(
    (part) =>
      (part.type === "text" && prompts.isCompact(part.text)) ||
      (part.type === "text" && part.text.trim().length === 0) ||
      part.type === "data-checkpoint",
  );
}

type AssistantMessageMetadata = Extract<MessageMetadata, { kind: "assistant" }>;

function isAssistantMetadata(m: unknown): m is AssistantMessageMetadata {
  return (
    typeof m === "object" &&
    m !== null &&
    (m as { kind?: string }).kind === "assistant"
  );
}

function mergeAssistantMetadata(
  a: AssistantMessageMetadata | undefined,
  b: AssistantMessageMetadata | undefined,
): AssistantMessageMetadata | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    ...a,
    ...b,
    totalStreamingDuration:
      a?.totalStreamingDuration !== undefined ||
      b?.totalStreamingDuration !== undefined
        ? (a?.totalStreamingDuration ?? 0) + (b?.totalStreamingDuration ?? 0)
        : undefined,
    totalToolsExecutionDuration:
      a?.totalToolsExecutionDuration !== undefined ||
      b?.totalToolsExecutionDuration !== undefined
        ? (a?.totalToolsExecutionDuration ?? 0) +
          (b?.totalToolsExecutionDuration ?? 0)
        : undefined,
  };
}

function combineConsecutiveAssistantMessages(
  messages: UIMessage[],
): UIMessage[] {
  const result: UIMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const prev = result[result.length - 1];

    // Fold a compact-only user message's checkpoint parts into an adjacent
    // assistant message so the surrounding assistant messages combine and the
    // compact checkpoint renders as a separator without a visible user row.
    if (isCompactOnlyUserMessage(message)) {
      const compactParts = message.parts.filter(
        (part) => part.type === "text" && prompts.isCompact(part.text),
      );
      const next = messages[i + 1];
      if (prev?.role === "assistant") {
        prev.parts.push(...compactParts);
        continue;
      }
      if (next?.role === "assistant") {
        next.parts.unshift(...compactParts);
        continue;
      }
      result.push(message);
      continue;
    }

    // Merge into the previous assistant message, keeping the later message's id
    // and prepending the earlier message's parts.
    if (message.role === "assistant" && prev?.role === "assistant") {
      message.parts.unshift(...prev.parts);

      const prevMessageMetadata = isAssistantMetadata(prev.metadata)
        ? prev.metadata
        : undefined;
      const messageMetadata = isAssistantMetadata(message.metadata)
        ? message.metadata
        : undefined;
      if (prevMessageMetadata || messageMetadata) {
        message.metadata = mergeAssistantMetadata(
          prevMessageMetadata,
          messageMetadata,
        );
      }

      result[result.length - 1] = message;
      continue;
    }

    result.push(message);
  }

  return result;
}

function removeEmptyMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => message.parts.length > 0);
}

function removeMessagesWithoutTextOrToolCall(
  messages: UIMessage[],
): UIMessage[] {
  return messages.filter((message) => {
    return message.parts.some((part) => {
      return part.type === "text" || isStaticToolUIPart(part);
    });
  });
}

function removeToolCallArgumentMetadata(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    message.parts = message.parts.map((part) => {
      if (
        isStaticToolUIPart(part) &&
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
        isStaticToolUIPart(part) &&
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
        isStaticToolUIPart(part) &&
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
        isStaticToolUIPart(part) &&
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

function replaceAttemptTodoCompletionForLLM(
  messages: UIMessage[],
): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== "assistant") return message;

    const parts = message.parts.map((part) => {
      if (!isAttemptTodoCompletionNewTaskPart(part)) return part;

      const attemptCompletion = getSavedAttemptCompletion(part);
      const callProviderMetadata =
        getCallProviderMetadataWithThoughtSignature(part);
      const replacementPart = {
        type: "tool-attemptCompletion",
        toolCallId: attemptCompletion?.toolCallId ?? part.toolCallId,
        input: attemptCompletion?.input ?? {},
        ...(callProviderMetadata ? { callProviderMetadata } : {}),
      };

      if (part.state === "output-available") {
        return {
          ...replacementPart,
          state: "output-available",
          output: getReplacementAttemptCompletionOutput(part),
        } as UIMessage["parts"][number];
      }

      return {
        ...replacementPart,
        state: "input-available",
      } as UIMessage["parts"][number];
    });

    return {
      ...message,
      parts,
    };
  });
}

function isAttemptTodoCompletionNewTaskPart(
  part: UIMessage["parts"][number],
): part is ToolUIPart & {
  input: {
    agentType?: unknown;
  };
} {
  return (
    isStaticToolUIPart(part) &&
    getStaticToolName(part) === "newTask" &&
    typeof part.input === "object" &&
    part.input !== null &&
    "agentType" in part.input &&
    part.input.agentType === AttemptTodoCompletionAgentName
  );
}

type SavedAttemptCompletion = {
  toolCallId: string;
  input: unknown;
};

type AttemptTodoCompletionInput = {
  _meta?: {
    sourceAttemptCompletion?: {
      toolCallId?: string;
      input?: unknown;
    };
  };
};

function getSavedAttemptCompletion(
  part: ToolUIPart & {
    input: {
      agentType?: unknown;
    };
  },
): SavedAttemptCompletion | undefined {
  const attemptCompletion = (part.input as AttemptTodoCompletionInput)._meta
    ?.sourceAttemptCompletion;
  if (typeof attemptCompletion?.toolCallId !== "string") return undefined;

  return {
    toolCallId: attemptCompletion.toolCallId,
    input: attemptCompletion.input,
  };
}

type AttemptTodoCompletionOutput = {
  result?: {
    success?: boolean;
    summary?: string;
    todos?: unknown;
  };
};

function getReplacementAttemptCompletionOutput(part: ToolUIPart) {
  const output = part.output as AttemptTodoCompletionOutput | undefined;
  const parsedResult = ResolvedAttemptTodoCompletionResult.safeParse(
    output?.result,
  );
  if (parsedResult.success) {
    const todos = { todos: parsedResult.data.todos };
    if (!isTodoListResolved(parsedResult.data.todos)) {
      return {
        success: false,
        reason:
          parsedResult.data.summary || "Todo completion was not accepted.",
        ...todos,
      };
    }

    return { success: true, ...todos };
  }

  const todos =
    output?.result && "todos" in output.result
      ? { todos: output.result.todos }
      : {};
  if (output?.result?.success === false) {
    return {
      success: false,
      reason: output.result.summary ?? "Todo completion was not accepted.",
      ...todos,
    };
  }

  return { success: true, ...todos };
}

function getCallProviderMetadataWithThoughtSignature(part: ToolUIPart) {
  const source = part as ToolUIPart & {
    providerMetadata?: Record<string, Record<string, unknown>>;
    callProviderMetadata?: Record<string, Record<string, unknown>>;
  };
  const metadata = source.providerMetadata;
  const existingMetadata = source.callProviderMetadata;
  let callProviderMetadata = existingMetadata
    ? { ...existingMetadata }
    : undefined;

  for (const [provider, value] of Object.entries(metadata ?? {})) {
    const thoughtSignature = value?.thoughtSignature;
    if (typeof thoughtSignature !== "string") continue;

    callProviderMetadata ??= {};
    callProviderMetadata[provider] = {
      ...callProviderMetadata[provider],
      thoughtSignature,
    };
  }

  return callProviderMetadata;
}

function removeInvalidCharForStorage(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    message.parts = message.parts.map((part) => {
      if (
        isStaticToolUIPart(part) &&
        getStaticToolName(part) === "executeCommand" &&
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
      if (part.type === "text") {
        return part.text.trim().length > 0;
      }
      if (part.type === "reasoning") {
        // Keep reasoning parts that have providerMetadata (e.g. OpenAI itemId),
        // because they need to be included as item_reference in subsequent API calls,
        // even if their text content is empty.
        if (
          part.providerMetadata &&
          Object.keys(part.providerMetadata).length > 0
        ) {
          return true;
        }
        return part.text.trim().length > 0;
      }
      return true;
    });
    return message;
  });
}

function removeEmptyReasoningPartsForUI(messages: UIMessage[]) {
  return messages.map((message) => {
    message.parts = message.parts.filter((part) => {
      if (part.type === "reasoning") {
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
      isStaticToolUIPart(part) &&
      (getStaticToolName(part) === "writeToFile" ||
        getStaticToolName(part) === "applyDiff") &&
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

function resolvePendingToolCallsForShareUI(messages: UIMessage[]) {
  const lastMessage = messages[messages.length - 1];
  const resolveLastMessage =
    lastMessage &&
    lastMessage.role === "assistant" &&
    lastMessage.parts.some((x) => isUserInputToolPart(x));

  return resolvePendingToolCalls(messages, resolveLastMessage);
}

type FormatOp = (messages: UIMessage[]) => UIMessage[];

function removePendingTodoAttemptCompletion(
  messages: UIMessage[],
): UIMessage[] {
  const lastMessage = messages.at(-1);
  if (!lastMessage || lastMessage.role !== "assistant") return messages;

  const lastPart = lastMessage.parts.at(-1);
  if (
    lastPart?.type !== "tool-attemptCompletion" ||
    lastPart.state === "output-available" ||
    lastPart.state === "output-error"
  ) {
    return messages;
  }

  // In todo mode the visible audit call is a replacement subtask; hide the
  // transient attemptCompletion part before the replacement arrives.
  return [
    ...messages.slice(0, -1),
    {
      ...lastMessage,
      parts: lastMessage.parts.slice(0, -1),
    },
  ];
}

function removeDeprecatedTodoWriteToolCalls(
  messages: UIMessage[],
): UIMessage[] {
  return removeEmptyMessages(
    messages.map((message) => ({
      ...message,
      parts: message.parts.filter(
        (part) =>
          !(
            isStaticToolUIPart(part) && getStaticToolName(part) === "todoWrite"
          ),
      ),
    })),
  );
}

const LLMFormatOps: FormatOp[] = [
  removeEmptyTextParts,
  removeEmptyMessages,
  refineDetectedNewPromblems,
  extractCompactMessages,
  removeMessagesWithoutTextOrToolCall,
  replaceAttemptTodoCompletionForLLM,
  resolvePendingToolCalls,
  stripKnownXMLTags,
  removeToolCallResultMetadata,
  removeToolCallResultTransientData,
  removeToolCallArgumentMetadata,
  removeToolCallArgumentTransientData,
];
const UIFormatOps = [
  removeEmptyTextParts,
  removeEmptyReasoningPartsForUI,
  removeEmptyMessages,
  refineDetectedNewPromblems,
  resolvePendingToolCalls,
  removeSystemReminder,
  combineConsecutiveAssistantMessages,
];
const ShareUIFormatOps = [...UIFormatOps, resolvePendingToolCallsForShareUI];
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

export interface UIFormatterOptions {
  hidePendingTodoAttemptCompletion?: boolean;
}

export interface LLMFormatterOptions {
  removeSystemReminder?: boolean;
}

export const formatters = {
  // Format messages for the Front-end UI rendering.
  ui: <T extends UIMessage>(messages: T[], options?: UIFormatterOptions) => {
    const uiFormatOps = [
      ...UIFormatOps,
      removeDeprecatedTodoWriteToolCalls,
      ...(options?.hidePendingTodoAttemptCompletion
        ? [removePendingTodoAttemptCompletion, removeEmptyMessages]
        : []),
    ];
    return formatMessages(messages, uiFormatOps) as T[];
  },

  shareUI: <T extends UIMessage>(messages: T[]) =>
    formatMessages(messages, ShareUIFormatOps) as T[],

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
