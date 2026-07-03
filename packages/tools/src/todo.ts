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
        '"completed" means the todo has been audited and verified as complete.',
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

export function initTodoModeTodos(objective: string): Todo[] {
  return [
    {
      id: crypto.randomUUID().slice(0, 8),
      content: objective,
      status: "in-progress",
      priority: "medium",
    },
  ];
}

export const TodoUpdate = z.object({
  id: z.string().describe("The id of the todo whose status should be updated."),
  status: z
    .enum(["in-progress", "completed", "cancelled"])
    .describe("The next status for the todo."),
});

export type TodoUpdate = z.infer<typeof TodoUpdate>;

export const AttemptTodoCompletionResult = z.object({
  summary: z.string().describe("A concise summary of the todo audit result."),
  todoUpdates: z
    .array(TodoUpdate)
    .describe("Status updates for audited todos."),
});

export type AttemptTodoCompletionResult = z.infer<
  typeof AttemptTodoCompletionResult
>;

export const ResolvedAttemptTodoCompletionResult =
  AttemptTodoCompletionResult.pick({
    summary: true,
  }).extend({
    todos: z.array(Todo).describe("The resolved complete todos list."),
  });

export type ResolvedAttemptTodoCompletionResult = z.infer<
  typeof ResolvedAttemptTodoCompletionResult
>;

export function resolveAttemptTodoCompletionResult(
  result: unknown,
  todos: readonly Todo[],
): ResolvedAttemptTodoCompletionResult {
  const parsedResult = AttemptTodoCompletionResult.safeParse(
    parseJsonString(result),
  );
  if (!parsedResult.success) {
    throw new Error("Invalid attemptTodoCompletion result");
  }

  const resolvedTodos = applyTodoStatusUpdates(
    todos,
    parsedResult.data.todoUpdates,
  );
  const resolvedResult = ResolvedAttemptTodoCompletionResult.safeParse({
    summary: parsedResult.data.summary,
    todos: resolvedTodos,
  });
  if (!resolvedResult.success) {
    throw new Error("Invalid attemptTodoCompletion result");
  }

  return resolvedResult.data;
}

function applyTodoStatusUpdates(
  todos: readonly Todo[],
  updates: readonly TodoUpdate[],
): Todo[] {
  const todoIds = new Set(todos.map((todo) => todo.id));
  const statusById = new Map<string, Todo["status"]>();

  for (const update of updates) {
    if (!todoIds.has(update.id) || statusById.has(update.id)) {
      throw new Error("Invalid attemptTodoCompletion result");
    }
    statusById.set(update.id, update.status);
  }

  return todos.map((todo) => ({
    ...todo,
    status: statusById.get(todo.id) ?? todo.status,
  }));
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function isTodoListResolved(todos: readonly Todo[]) {
  return todos.every(isTodoResolved);
}

function isTodoResolved(todo: Todo) {
  return todo.status === "completed" || todo.status === "cancelled";
}
