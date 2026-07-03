import { ResolvedAttemptTodoCompletionResult } from "@getpochi/tools";
import { parseJsonObjectString } from "../tool-result-display";

export type AttemptTodoCompletionState = {
  status: "completed" | "needs-work";
  summary: string;
};

export function hasNewTaskResult(result: unknown): boolean {
  if (typeof result === "string") {
    return result.trim().length > 0;
  }
  return result !== undefined && result !== null;
}

export function getAttemptTodoCompletionSummary(
  result: unknown,
): string | undefined {
  return getAttemptTodoCompletionState(result)?.summary;
}

export function getAttemptTodoCompletionState(
  result: unknown,
): AttemptTodoCompletionState | undefined {
  const parsed = parseJsonObjectString(result) ?? result;
  const parsedResult = ResolvedAttemptTodoCompletionResult.safeParse(parsed);
  if (!parsedResult.success) return undefined;
  const summary = parsedResult.data.summary.trim();
  if (!summary) return undefined;
  return {
    status: parsedResult.data.success ? "completed" : "needs-work",
    summary,
  };
}
