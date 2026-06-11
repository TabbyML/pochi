import { z } from "zod";

export const Todo = z.object({
  id: z
    .string()
    .describe(
      "A stable generated identifier for this todo. Do not use semantic ids such as goal or main.",
    ),
  content: z
    .string()
    .describe(
      "The user-provided task represented by this todo. Do not rewrite it into a smaller or easier task.",
    ),
  status: z
    .enum(["pending", "in-progress", "completed", "cancelled"])
    .describe(
      [
        "The execution state of the todo.",
        '"pending" or "in-progress" means the todo is still active.',
        '"completed" means the todo has been audited and verified as achieved.',
        '"cancelled" means the todo was stopped without completion by user/controller action.',
      ].join(" "),
    ),
  priority: z
    .enum(["low", "medium", "high"])
    .describe(
      'Compatibility field retained for existing clients. The controller ignores priority and initializes it as "medium".',
    ),
});

export type Todo = z.infer<typeof Todo>;
