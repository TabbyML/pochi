import * as path from "node:path";
import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import { matter } from "vfile-matter";
import z from "zod/v4";
import { builtInAgents, toErrorMessage } from "../base";
import type { CustomAgentFile } from "../vscode-webui-bridge";
import type {
  InvalidCustomAgentFile,
  ValidCustomAgentFile,
} from "../vscode-webui-bridge/types/custom-agent";

type VFile = Parameters<typeof matter>[0];

const CustomAgentFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string(),
  model: z.string().optional(),
  tools: z.union([z.string(), z.array(z.string())]).optional(),
  omitAgentsMd: z.boolean().optional(),
});

/**
 * Parse a custom agent file content
 */
export async function parseAgentFile(
  filePath: string,
  readFileContent: (filePath: string) => Promise<string>,
): Promise<CustomAgentFile> {
  const defaultName = path.basename(filePath, path.extname(filePath));
  let content: string;
  try {
    content = await readFileContent(filePath);
  } catch (error) {
    return {
      name: defaultName,
      filePath,
      error: "readError",
      message: toErrorMessage(error),
    } satisfies InvalidCustomAgentFile;
  }

  let vfile: VFile;
  try {
    vfile = await remark()
      .use(remarkFrontmatter, [{ type: "yaml", marker: "-" }])
      .use(() => (_tree, file) => matter(file))
      .process(content);
  } catch (error) {
    return {
      name: defaultName,
      filePath,
      error: "parseError",
      message: toErrorMessage(error),
    } satisfies InvalidCustomAgentFile;
  }

  const systemPrompt = vfile.value.toString().trim();

  if (!vfile.data.matter || Object.keys(vfile.data.matter).length === 0) {
    return {
      name: defaultName,
      filePath,
      error: "parseError",
      message: "No agent definition found in the frontmatter of the file.",
      systemPrompt,
    } satisfies InvalidCustomAgentFile;
  }

  const parseResult = CustomAgentFrontmatter.safeParse(vfile.data.matter);
  if (!parseResult.success) {
    return {
      name: defaultName,
      filePath,
      error: "validationError",
      message: z.prettifyError(parseResult.error),
      systemPrompt,
    } satisfies InvalidCustomAgentFile;
  }

  const frontmatterData = parseResult.data;
  const toolsRaw = frontmatterData.tools;
  let tools: string[] | undefined;
  if (typeof toolsRaw === "string") {
    const toolsRawStr = toolsRaw.trim();
    tools = toolsRawStr.length > 0 ? splitTools(toolsRawStr) : [];
  } else if (Array.isArray(toolsRaw)) {
    tools = toolsRaw
      .map((tool) => tool.trim())
      .filter((tool) => tool.length > 0);
  }

  const invalidTool = tools?.find((tool) => !isValidToolDeclaration(tool));
  if (invalidTool) {
    return {
      name: defaultName,
      filePath,
      error: "validationError",
      message: `Invalid tool declaration \"${invalidTool}\". Use one declaration per tool rule, for example: readFile(src/**), readFile(pochi://-/plan.md).`,
      systemPrompt,
    } satisfies InvalidCustomAgentFile;
  }

  const agentName = frontmatterData.name || defaultName;

  if (builtInAgents.some((agent) => agent.name === agentName)) {
    return {
      name: agentName,
      filePath,
      error: "validationError",
      message: `"${agentName}" is a reserved built-in agent name. Please choose a different name. Reserved names: ${builtInAgents.map((agent) => agent.name).join(", ")}`,
      systemPrompt,
    } satisfies InvalidCustomAgentFile;
  }

  return {
    filePath,
    name: agentName,
    tools,
    description: frontmatterData.description,
    systemPrompt,
    model: frontmatterData.model,
    omitAgentsMd: frontmatterData.omitAgentsMd,
  } satisfies ValidCustomAgentFile;
}

function splitTools(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < input.length; index++) {
    const ch = input[index];
    if (ch === "(") {
      depth++;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (ch === "," && depth === 0) {
      const token = input.slice(start, index).trim();
      if (token.length > 0) {
        parts.push(token);
      }
      start = index + 1;
    }
  }

  const tail = input.slice(start).trim();
  if (tail.length > 0) {
    parts.push(tail);
  }

  return parts;
}

function isValidToolDeclaration(tool: string): boolean {
  if (!tool.includes("(") && !tool.includes(")")) {
    return true;
  }

  const openParenIndex = tool.indexOf("(");
  if (openParenIndex <= 0 || tool.at(-1) !== ")") {
    return false;
  }

  const scopedPart = tool.slice(openParenIndex + 1, -1);
  if (scopedPart.includes(",")) {
    return false;
  }

  let depth = 0;
  for (let i = openParenIndex; i < tool.length; i++) {
    const ch = tool[i];
    if (ch === "(") {
      depth++;
      continue;
    }
    if (ch === ")") {
      depth--;
      if (depth < 0) {
        return false;
      }
      if (depth === 0 && i !== tool.length - 1) {
        return false;
      }
    }
  }

  return depth === 0;
}
