import * as path from "node:path";
import type { CustomAgent } from "@getpochi/tools";
import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import { matter } from "vfile-matter";
import z from "zod/v4";

/**
 * Parse a custom agent file content
 */
export async function parseAgentFile(
  filePath: string,
  content: string,
): Promise<CustomAgent | undefined> {
  const file = await remark()
    .use(remarkFrontmatter, [{ type: "yaml", marker: "-" }])
    .use(() => (_tree, file) => matter(file))
    .process(content);

  const parseResult = CustomAgentFrontmatter.safeParse(file.data.matter);
  if (!parseResult.success) {
    return undefined;
  }

  const frontmatterData = parseResult.data;
  const systemPrompt = file.value.toString().trim();
  const defaultName = path.basename(filePath, path.extname(filePath));

  const toolsRaw = frontmatterData.tools;
  let tools: string[] | undefined;
  if (typeof toolsRaw === "string") {
    tools = toolsRaw ? toolsRaw.split(",").map((tool) => tool.trim()) : [];
  } else if (Array.isArray(toolsRaw)) {
    tools = toolsRaw;
  }

  return {
    name: frontmatterData.name || defaultName,
    tools,
    description: frontmatterData.description,
    systemPrompt,
  } satisfies CustomAgent;
}

const CustomAgentFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string(),
  tools: z.union([z.string(), z.array(z.string())]).optional(),
});
