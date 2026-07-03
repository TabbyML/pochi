import type { Message } from "@getpochi/livekit";
import {
  ResolvedAttemptTodoCompletionResult,
  isTodoListResolved,
} from "@getpochi/tools";

export function shouldResumeTodoController({
  messages,
  status,
}: {
  messages: Message[];
  status: string;
}) {
  if (status !== "ready") return false;
  return getTodoContinuationDecision(messages) === true;
}

export function getTodoContinuationDecision(
  messages: Message[],
): boolean | undefined {
  const attemptTodoCompletion = getLastAttemptTodoCompletion(messages);
  if (attemptTodoCompletion) {
    const resolved = getAttemptTodoCompletionResolved(
      attemptTodoCompletion.part.output,
    );
    return resolved === false;
  }

  return undefined;
}

function getLastAttemptTodoCompletion(messages: Message[]) {
  const message = messages.at(-1);
  if (message?.role !== "assistant") return undefined;

  const part = message.parts.at(-1);
  if (
    part?.type === "tool-newTask" &&
    part.state === "output-available" &&
    part.input?.agentType === "attemptTodoCompletion"
  ) {
    return { message, part };
  }
}

function getAttemptTodoCompletionResolved(
  output: unknown,
): boolean | undefined {
  const normalizedOutput = unwrapJsonOutput(output);
  const result =
    isRecord(normalizedOutput) && "result" in normalizedOutput
      ? unwrapJsonOutput(normalizedOutput.result)
      : undefined;

  for (const candidate of [result, normalizedOutput]) {
    const parsedResult =
      ResolvedAttemptTodoCompletionResult.safeParse(candidate);
    if (parsedResult.success) {
      return isTodoListResolved(parsedResult.data.todos);
    }

    const legacySuccess = getLegacyAttemptTodoCompletionSuccess(candidate);
    if (legacySuccess !== undefined) return legacySuccess;
  }
}

function getLegacyAttemptTodoCompletionSuccess(
  candidate: unknown,
): boolean | undefined {
  if (
    isRecord(candidate) &&
    "success" in candidate &&
    typeof candidate.success === "boolean"
  ) {
    return candidate.success;
  }
}

function unwrapJsonOutput(output: unknown): unknown {
  if (isRecord(output) && output.type === "json" && "value" in output) {
    return output.value;
  }

  if (typeof output === "string") {
    try {
      return JSON.parse(output);
    } catch {
      return output;
    }
  }

  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
