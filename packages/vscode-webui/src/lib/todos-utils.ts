import {
  ResolvedAttemptTodoCompletionResult,
  type ResolvedAttemptTodoCompletionResult as ResolvedAttemptTodoCompletionResultData,
  isTodoListResolved,
} from "@getpochi/tools";

export function parseAttemptTodoCompletionResult(
  result: unknown,
): ResolvedAttemptTodoCompletionResultData | undefined {
  const parsedResult = ResolvedAttemptTodoCompletionResult.safeParse(
    unwrapJsonOutput(result),
  );
  return parsedResult.success ? parsedResult.data : undefined;
}

export function getAttemptTodoCompletionSummary(
  result: unknown,
): string | undefined {
  const summary = parseAttemptTodoCompletionResult(result)?.summary.trim();
  return summary || undefined;
}

export function isAttemptTodoCompletionResolved(
  output: unknown,
): boolean | undefined {
  const unwrappedOutput = unwrapJsonOutput(output);
  const outputResult =
    isRecord(unwrappedOutput) && "result" in unwrappedOutput
      ? unwrappedOutput.result
      : undefined;

  for (const candidate of [outputResult, unwrappedOutput]) {
    const resolved = isCandidateResolved(candidate);
    if (resolved !== undefined) return resolved;
  }
}

function isCandidateResolved(candidate: unknown) {
  const parsedResult = parseAttemptTodoCompletionResult(candidate);
  if (parsedResult) return isTodoListResolved(parsedResult.todos);

  const unwrappedCandidate = unwrapJsonOutput(candidate);
  if (
    isRecord(unwrappedCandidate) &&
    "success" in unwrappedCandidate &&
    typeof unwrappedCandidate.success === "boolean"
  ) {
    return unwrappedCandidate.success;
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
