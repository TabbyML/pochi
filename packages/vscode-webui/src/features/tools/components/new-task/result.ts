import { AttemptTodoCompletionResult } from "@getpochi/tools";
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
  const parsed = parseJsonObjectString(result) ?? result;
  const parsedResult = AttemptTodoCompletionResult.safeParse(parsed);
  if (!parsedResult.success) return undefined;
  return parsedResult.data.summary.trim() || undefined;
}
