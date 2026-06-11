import { z } from "zod";
import { parseJsonObjectString } from "../tool-result-display";

// FIXME: Share this schema with the attemptTodoCompletion agent frontmatter.
const attemptTodoCompletionResultSchema = z.object({
  success: z.boolean(),
  summary: z.string(),
  todoUpdates: z.array(
    z.object({
      id: z.string().optional(),
      status: z.enum(["in-progress", "completed", "cancelled"]),
    }),
  ),
});

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
  const parsedResult = attemptTodoCompletionResultSchema.safeParse(parsed);
  if (!parsedResult.success) return undefined;
  return parsedResult.data.summary.trim() || undefined;
}
