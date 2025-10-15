import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import { matter } from "vfile-matter";
import z from "zod/v4";
import { toErrorMessage } from "../base";

type VFile = Parameters<typeof matter>[0];

const WorkflowFrontmatter = z.object({
  model: z.string().optional(),
});

/**
 * Parse a workflow file frontmatter
 */
export async function parseWorkflowFrontmatter(content: string | null) {
  if (!content) return { model: undefined };
  let vfile: VFile;
  try {
    vfile = await remark()
      .use(remarkFrontmatter, [{ type: "yaml", marker: "-" }])
      .use(() => (_tree, file) => matter(file))
      .process(content);
  } catch (error) {
    return {
      model: undefined,
      error: "parseError",
      message: toErrorMessage(error),
    };
  }

  if (!vfile.data.matter || Object.keys(vfile.data.matter).length === 0) {
    return {
      model: undefined,
    };
  }

  const parseResult = WorkflowFrontmatter.safeParse(vfile.data.matter);
  if (!parseResult.success) {
    return {
      model: undefined,
      error: "validationError",
      message: z.prettifyError(parseResult.error),
    };
  }

  const frontmatterData = parseResult.data;

  return {
    model: frontmatterData.model,
  };
}
