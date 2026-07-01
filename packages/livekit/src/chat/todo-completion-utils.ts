import { constants, prompts } from "@getpochi/common";
import type { Todo } from "@getpochi/tools";
import type { Message } from "../types";

export function buildAttemptTodoCompletionInput(
  todos: readonly Todo[],
  completionResult: unknown,
  options?: {
    uid?: string;
    sourceAttemptCompletion?: {
      toolCallId: string;
      input: unknown;
    };
  },
) {
  const meta = options?.uid
    ? {
        uid: options.uid,
        todos: todos.map((todo) => ({ ...todo })),
        ...(options.sourceAttemptCompletion
          ? { sourceAttemptCompletion: options.sourceAttemptCompletion }
          : {}),
      }
    : undefined;

  return {
    description: "",
    agentType: constants.AttemptTodoCompletionAgentName,
    prompt: prompts.attemptTodoCompletion.buildPrompt(todos, completionResult),
    ...(meta ? { _meta: meta } : {}),
  };
}

export function replaceAttemptCompletionWithTodoSubtask(
  message: Message,
  todos: readonly Todo[],
  options?: {
    toolCallId?: string;
    uid?: string;
  },
): Message {
  const lastStepStartIndex = message.parts.findLastIndex(
    (part) => part.type === "step-start",
  );
  const lastStepStart = lastStepStartIndex >= 0 ? lastStepStartIndex : 0;
  const targetIndex = message.parts.findLastIndex(
    (part, index) =>
      index >= lastStepStart &&
      part.type === "tool-attemptCompletion" &&
      part.state === "input-available",
  );

  if (targetIndex < 0) {
    return message;
  }

  const target = message.parts[targetIndex];
  if (target?.type !== "tool-attemptCompletion") {
    return message;
  }

  const parts = message.parts.map((part, index) => {
    if (index !== targetIndex) return part;
    const callProviderMetadata = getCallProviderMetadata(target);
    return {
      type: "tool-newTask",
      toolCallId: options?.toolCallId ?? target.toolCallId,
      state: "input-available",
      input: buildAttemptTodoCompletionInput(todos, target.input?.result, {
        uid: options?.uid,
        sourceAttemptCompletion: {
          toolCallId: target.toolCallId,
          input: target.input,
        },
      }),
      ...(callProviderMetadata ? { callProviderMetadata } : {}),
    } satisfies Message["parts"][number];
  });

  return {
    ...message,
    parts,
  };
}

function getCallProviderMetadata(part: Message["parts"][number]) {
  return "callProviderMetadata" in part ? part.callProviderMetadata : undefined;
}
