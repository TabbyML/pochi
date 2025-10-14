import matter from "gray-matter";
import z from "zod/v4";
import { toErrorMessage } from "../base";

const WorkflowFrontmatter = z.object({
  model: z.string().optional(),
  "allowed-tools": z.string().optional(),
});

/**
 * Parse a workflow file frontmatter
 */
export function parseWorkflowFrontmatter(content: string | null): {
  model: string | undefined;
  allowedTools: string | undefined;
  error?: string;
  message?: string;
} {
  if (!content) return { model: undefined, allowedTools: undefined };

  try {
    const { data } = matter(content);

    if (Object.keys(data).length === 0) {
      return {
        model: undefined,
        allowedTools: undefined,
      };
    }

    const parseResult = WorkflowFrontmatter.safeParse(data);
    if (!parseResult.success) {
      return {
        model: undefined,
        allowedTools: undefined,
        error: "validationError",
        message: z.prettifyError(parseResult.error),
      };
    }

    const frontmatterData = parseResult.data;

    return {
      model: frontmatterData.model,
      allowedTools: frontmatterData["allowed-tools"],
    };
  } catch (error) {
    return {
      model: undefined,
      allowedTools: undefined,
      error: "parseError",
      message: toErrorMessage(error),
    };
  }
}
