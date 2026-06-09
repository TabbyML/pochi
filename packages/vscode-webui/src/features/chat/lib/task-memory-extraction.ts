import type { ContextWindowUsage, TaskMemoryState } from "@getpochi/common";
import { constants, TaskMemoryFileUri } from "@getpochi/common";
import type { Message, Task } from "@getpochi/livekit";
import { isCompletionToolPart } from "@getpochi/tools";
import { isStaticToolUIPart } from "ai";

export type ExtractionData = {
  messages: Message[];
  contextWindowUsage?: ContextWindowUsage;
};

export type ExtractionMetrics = {
  tokens: number;
  toolCalls: number;
  trailingMessageId: string | undefined;
  trailingMessageHasOpenToolCall: boolean;
};

export type TaskMemoryExtractionResult = "pending" | "succeeded" | "failed";

export function getExtractionMetrics(data: ExtractionData): ExtractionMetrics {
  const last = data.messages.at(-1);
  return {
    tokens: computeTotalTokens(data.contextWindowUsage),
    toolCalls: countToolCalls(data.messages),
    trailingMessageId: last?.id,
    trailingMessageHasOpenToolCall: lastMessageHasOpenToolCall(data.messages),
  };
}

function computeTotalTokens(usage?: ContextWindowUsage) {
  if (!usage) return 0;
  return (
    (usage.system ?? 0) +
    (usage.tools ?? 0) +
    (usage.messages ?? 0) +
    (usage.files ?? 0) +
    (usage.toolResults ?? 0) +
    (usage.projectMemory ?? 0)
  );
}

function countToolCalls(messages: Message[]): number {
  let count = 0;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (isStaticToolUIPart(part)) {
        count++;
      }
    }
  }
  return count;
}

/** True if the trailing assistant turn has non-terminal tool calls without output yet. */
export function lastMessageHasOpenToolCall(messages: Message[]): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return false;
  return last.parts.some((part) => {
    if (!isStaticToolUIPart(part) || isCompletionToolPart(part)) return false;
    return part.state !== "output-available" && part.state !== "output-error";
  });
}

export function shouldExtractTaskMemory(
  state: TaskMemoryState,
  metrics: ExtractionMetrics,
): boolean {
  if (state.isExtracting) return false;

  if (!state.initialized) {
    return metrics.tokens >= constants.TaskMemoryInitTokenThreshold;
  }

  const tokenDelta = metrics.tokens - state.lastExtractionTokens;
  const toolCallDelta = metrics.toolCalls - state.lastExtractionToolCalls;

  return (
    tokenDelta >= constants.TaskMemoryUpdateTokenIncrement &&
    toolCallDelta >= constants.TaskMemoryUpdateToolCallThreshold
  );
}

export function toExtractingState(
  state: TaskMemoryState,
  metrics: ExtractionMetrics,
): TaskMemoryState {
  return {
    ...state,
    initialized: true,
    isExtracting: true,
    lastExtractionTokens: metrics.tokens,
    lastExtractionToolCalls: metrics.toolCalls,
    pendingExtractionMessageId: metrics.trailingMessageId,
  };
}

export function getTaskMemoryExtractionResult(
  task: Pick<Task, "status"> | null | undefined,
  messages: Message[],
): TaskMemoryExtractionResult {
  for (const message of messages) {
    for (const part of message.parts) {
      if (
        isStaticToolUIPart(part) &&
        part.state === "output-available" &&
        isTaskMemoryPath(part.input)
      ) {
        return "succeeded";
      }
    }
  }

  if (!task) return "pending";
  if (task.status === "pending-model" || task.status === "pending-tool") {
    return "pending";
  }

  return "failed";
}

function isTaskMemoryPath(input: unknown): boolean {
  if (!input || typeof input !== "object" || !("path" in input)) return false;
  return input.path === TaskMemoryFileUri;
}
