import type { Todo } from "@getpochi/tools";

export function buildAttemptTodoCompletionPrompt(
  _todos: readonly Todo[],
  completionResult: unknown,
): string {
  const resultText =
    typeof completionResult === "string"
      ? completionResult
      : JSON.stringify(completionResult);

  return [
    "Audit whether the todo is complete in the current workspace.",
    "",
    "",
    renderPriorSummary(resultText ?? ""),
  ].join("\n");
}

function renderPriorSummary(text: string): string {
  return ["**Prior work summary**", ...text.split("\n")].join("\n");
}
