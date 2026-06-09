import * as path from "node:path";
import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import { remove } from "unist-util-remove";
import { matter } from "vfile-matter";
import { toErrorMessage } from "../base";

export interface MarkdownWithFrontmatterOptions {
  folderFileName?: string;
}

export type ParsedMarkdownWithFrontmatter =
  | {
      ok: true;
      defaultName: string;
      frontmatter: Record<string, unknown>;
      body: string;
    }
  | {
      ok: false;
      defaultName: string;
      error: "readError" | "parseError";
      message: string;
      body?: string;
    };

export async function parseMarkdownWithFrontmatter(
  filePath: string,
  readFileContent: (filePath: string) => Promise<string>,
  options?: MarkdownWithFrontmatterOptions,
): Promise<ParsedMarkdownWithFrontmatter> {
  const defaultName = computeDefaultName(filePath, options?.folderFileName);

  let content: string;
  try {
    content = await readFileContent(filePath);
  } catch (error) {
    return {
      ok: false,
      defaultName,
      error: "readError",
      message: toErrorMessage(error),
    };
  }

  type VFile = Parameters<typeof matter>[0];
  let vfile: VFile;
  try {
    vfile = await remark()
      .use(remarkFrontmatter, [{ type: "yaml", marker: "-" }])
      .use(() => (_tree, file) => matter(file))
      .use(() => (tree) => {
        remove(tree, "yaml");
      })
      .process(content);
  } catch (error) {
    return {
      ok: false,
      defaultName,
      error: "parseError",
      message: toErrorMessage(error),
    };
  }

  const body = vfile.value.toString().trim();
  const frontmatter = (vfile.data.matter ?? {}) as Record<string, unknown>;

  if (Object.keys(frontmatter).length === 0) {
    return {
      ok: false,
      defaultName,
      error: "parseError",
      message: "No definition found in the frontmatter of the file.",
      body,
    };
  }

  return { ok: true, defaultName, frontmatter, body };
}

function computeDefaultName(filePath: string, folderFileName?: string): string {
  const baseName = path.basename(filePath);
  if (
    folderFileName &&
    baseName.toLowerCase() === folderFileName.toLowerCase()
  ) {
    return path.basename(path.dirname(filePath));
  }
  return path.basename(baseName, path.extname(baseName));
}
