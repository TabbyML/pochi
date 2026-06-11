import type { Todo } from "@getpochi/tools";

export function buildAttemptTodoCompletionPrompt(
  todos: readonly Todo[],
  completionResult: unknown,
): string {
  const resultText =
    typeof completionResult === "string"
      ? completionResult
      : JSON.stringify(completionResult);
  const quotedResult = quotePriorSummary(
    "Prior work summary",
    resultText ?? "",
  );

  return [
    "Audit whether the todo below is satisfied in the current workspace:",
    todos[0]?.content ?? "",
    "",
    quotedResult,
    "",
    "**Verification rule**",
    "Treat the summary as context, not proof. Verify the current workspace state before deciding the todo status.",
  ].join("\n");
}

function quotePriorSummary(title: string, text: string): string {
  return [title, ...text.split("\n")].map((line) => `> ${line}`).join("\n");
}
