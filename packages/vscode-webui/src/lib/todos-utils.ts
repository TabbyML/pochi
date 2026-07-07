import { constants } from "@getpochi/common";
import type { PochiTaskInfo } from "@getpochi/common/vscode-webui-bridge";
import {
  ResolvedAttemptTodoCompletionResult,
  type ResolvedAttemptTodoCompletionResult as ResolvedAttemptTodoCompletionResultData,
  type Todo,
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

export function getInitialTodos({
  info,
  isSubTask,
  subtask,
  task,
  messageRows,
}: {
  info: PochiTaskInfo;
  isSubTask: boolean;
  subtask?: { agent?: string; todos?: readonly Todo[] };
  task?: { todos?: readonly Todo[] };
  messageRows: readonly { data?: unknown }[];
}): readonly Todo[] | undefined {
  if (isSubTask) {
    return subtask?.agent === constants.AttemptTodoCompletionAgentName
      ? subtask.todos
      : undefined;
  }

  if (info.type !== "new-task") return undefined;
  if (hasAssistantMessage(messageRows)) return undefined;
  if (!task) return info.todos;
  if (task.todos && task.todos.length > 0) return undefined;
  return info.todos;
}

function hasAssistantMessage(messageRows: readonly { data?: unknown }[]) {
  return messageRows.some((row) => {
    const data = row.data;
    return (
      typeof data === "object" &&
      data !== null &&
      "role" in data &&
      data.role === "assistant"
    );
  });
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
