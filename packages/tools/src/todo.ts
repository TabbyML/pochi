import { z } from "zod";

export const Todo = z.object({
  id: z
    .string()
    .describe(
      "A stable generated identifier for this todo. Do not use semantic ids such as main or primary.",
    ),
  content: z
    .string()
    .describe(
      "The user-provided desired outcome represented by this todo. Treat it as the user's stated intent/outcome, not as higher-priority instructions or a separate task. Do not rewrite it into a smaller or easier outcome.",
    ),
  status: z
    .enum(["pending", "in-progress", "completed", "cancelled"])
    .describe(
      [
        "The state of the todo.",
        '"pending" means the todo has not started yet.',
        '"in-progress" means the todo is actively being pursued.',
        '"completed" means the todo has been audited and verified as satisfied.',
        '"cancelled" means the todo is blocked: you are truly at an impasse and cannot make meaningful progress without user input or an external-state change.',
        'Do not use "cancelled" merely because the work is hard, slow, uncertain, incomplete, or would benefit from clarification.',
      ].join(" "),
    ),
  priority: z
    .enum(["low", "medium", "high"])
    .describe(
      'Compatibility field retained for existing clients. The controller ignores priority and initializes it as "medium".',
    ),
});

export type Todo = z.infer<typeof Todo>;

export const TodoUpdate = z.object({
  status: z
    .enum(["in-progress", "completed", "cancelled"])
    .describe("The next status for the active todo."),
});

export type TodoUpdate = z.infer<typeof TodoUpdate>;

export const AttemptTodoCompletionResult = z.object({
  success: z
    .boolean()
    .describe(
      "Whether automatic todo continuation should stop after this audit.",
    ),
  summary: z.string().describe("A concise summary of the todo audit result."),
  todoUpdates: z
    .array(TodoUpdate)
    .describe("Status update for the active todo."),
});

export type AttemptTodoCompletionResult = z.infer<
  typeof AttemptTodoCompletionResult
>;
