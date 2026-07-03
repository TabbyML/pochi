import {
  ResolvedAttemptTodoCompletionResult,
  isTodoListResolved,
} from "@getpochi/tools";
import { parseJsonObjectString } from "../tool-result-display";

export function hasNewTaskResult(result: unknown): boolean {
  if (typeof result === "string") {
    return result.trim().length > 0;
  }
  return result !== undefined && result !== null;
}

export function getAttemptTodoCompletionSummary(
  result: unknown,
): string | undefined {
  const summary = parseAttemptTodoCompletionResult(result)?.summary.trim();
  return summary || undefined;
}

export function isAttemptTodoCompletionResolved(
  result: unknown,
): boolean | undefined {
  const parsedResult = parseAttemptTodoCompletionResult(result);
  return parsedResult ? isTodoListResolved(parsedResult.todos) : undefined;
}

function parseAttemptTodoCompletionResult(result: unknown) {
  const parsed = parseJsonObjectString(result) ?? result;
  const parsedResult = ResolvedAttemptTodoCompletionResult.safeParse(parsed);
  if (!parsedResult.success) return undefined;
  return parsedResult.data;
}
