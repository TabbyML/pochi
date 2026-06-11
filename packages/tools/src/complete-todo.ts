import { z } from "zod";
import { NoOtherToolsReminderPrompt } from "./constants";
import { type Todo, Todo as TodoSchema } from "./todo";
import { defineClientTool } from "./types";

export const completeTodoAuditOutputSchema = z.object({
  todoUpdates: z
    .array(
      z.object({
        id: z.string(),
        status: TodoSchema.shape.status,
      }),
    )
    .describe("Todo status updates produced by the audit."),
  summary: z.string().describe("A concise summary of the audit result."),
});

export type CompleteTodoAuditOutput = z.infer<
  typeof completeTodoAuditOutputSchema
>;

export const completeTodoOutputSchema = z.object({
  success: z
    .boolean()
    .describe(
      "Whether the active todo is finished, either completed or cancelled, and automatic continuation should stop.",
    ),
  summary: z.string().describe("A concise summary of the audit result."),
});

export type CompleteTodoOutput = z.infer<typeof completeTodoOutputSchema>;

function isActiveTodo(todo: Todo): boolean {
  return todo.status === "pending" || todo.status === "in-progress";
}

export function resolveCompleteTodoAuditResult(
  currentTodos: readonly Todo[],
  audit: CompleteTodoAuditOutput,
): { todos: Todo[]; output: CompleteTodoOutput } {
  const statusById = new Map<string, Todo["status"]>(
    audit.todoUpdates.map((update) => [update.id, update.status]),
  );
  const todos = currentTodos.map((todo) => {
    const status = statusById.get(todo.id);
    return status === undefined ? todo : { ...todo, status };
  });

  return {
    todos,
    output: {
      success: !todos.some(isActiveTodo),
      summary: audit.summary,
    },
  };
}

export const completeTodo = defineClientTool({
  description: `Audit the active todo and update its status.

Call this after you have made concrete progress and before you would otherwise finish your turn while an active todo remains. The audit checks the current workspace, updates the active todo status, and returns whether automatic continuation should stop or keep working.

Do not use this tool as a substitute for doing the work. If the todo is clearly incomplete and you still have useful work to do in this turn, keep working before calling completeTodo.

${NoOtherToolsReminderPrompt}
`.trim(),
  inputSchema: z.object({}),
  outputSchema: completeTodoOutputSchema,
});
