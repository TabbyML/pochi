import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import { matter } from "vfile-matter";
import z from "zod/v4";
import { toErrorMessage } from "../base";

type VFile = Parameters<typeof matter>[0];

const WorkflowFrontmatter = z.object({
  model: z.string().optional(),
});

type ParsedWorkflow = {
  frontmatter: { model: string | undefined };
  content: string;
  error?: string;
  message?: string;
};

/**
 * Parse a workflow file
 */
export async function parseWorkflow(
  content: string | null,
): Promise<ParsedWorkflow> {
  if (!content) {
    return { frontmatter: { model: undefined }, content: "" };
  }
  let vfile: VFile;
  try {
    vfile = await remark()
      .use(remarkFrontmatter, [{ type: "yaml", marker: "-" }])
      .use(() => (_tree, file) => matter(file))
      .use(() => (tree) => {
        // Remove frontmatter nodes from the tree
        if ("children" in tree && Array.isArray(tree.children)) {
          tree.children = tree.children.filter((node) => node.type !== "yaml");
        }
      })
      .process(content);
  } catch (error) {
    return {
      frontmatter: { model: undefined },
      content: content,
      error: "parseError",
      message: toErrorMessage(error),
    };
  }

  const contentWithoutFrontmatter = String(vfile);

  if (!vfile.data.matter || Object.keys(vfile.data.matter).length === 0) {
    return {
      frontmatter: { model: undefined },
      content: contentWithoutFrontmatter,
    };
  }

  const parseResult = WorkflowFrontmatter.safeParse(vfile.data.matter);
  if (!parseResult.success) {
    return {
      frontmatter: { model: undefined },
      content: contentWithoutFrontmatter,
      error: "validationError",
      message: z.prettifyError(parseResult.error),
    };
  }

  const frontmatterData = parseResult.data;

  return {
    frontmatter: { model: frontmatterData.model },
    content: contentWithoutFrontmatter,
  };
}
