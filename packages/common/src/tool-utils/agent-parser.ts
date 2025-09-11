import { CustomAgent } from "@getpochi/tools";
import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import { matter } from "vfile-matter";

/**
 * Parse a custom agent file content
 */
export async function parseAgentFile(
  content: string,
): Promise<CustomAgent | undefined> {
  const file = await remark()
    .use(remarkFrontmatter, [{ type: "yaml", marker: "-" }])
    .use(() => (_tree, file) => matter(file))
    .process(content);

  const systemPrompt = file.value.toString().trim();
  const frontmatterData = file.data.matter;

  if (typeof frontmatterData !== "object" || frontmatterData === null) {
    return;
  }

  if ("tools" in frontmatterData && typeof frontmatterData.tools === "string") {
    const tools = frontmatterData.tools.split(",").map((tool) => tool.trim());
    frontmatterData.tools = tools;
  }

  const agentData = { ...frontmatterData, systemPrompt };
  const result = CustomAgent.safeParse(agentData);

  if (result.success) {
    return result.data;
  }
}
