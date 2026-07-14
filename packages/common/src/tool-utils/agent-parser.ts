import z from "zod";
import type { CustomAgentFile } from "../vscode-webui-bridge";
import type {
  InvalidCustomAgentFile,
  ValidCustomAgentFile,
} from "../vscode-webui-bridge/types/custom-agent";
import { parseMarkdownWithFrontmatter } from "./markdown-frontmatter";

const CustomAgentFrontmatter = z.object({
  name: z.string().optional(),
  description: z.string(),
  model: z.string().optional(),
  tools: z.union([z.string(), z.array(z.string())]).optional(),
  omitAgentsMd: z.boolean().optional(),
  _internal: z
    .object({
      resultSchema: z.string().optional(),
    })
    .optional(),
});

const EmptyFrontmatterMessage =
  "No agent definition found in the frontmatter of the file.";

export async function parseAgentFile(
  filePath: string,
  readFileContent: (filePath: string) => Promise<string>,
): Promise<CustomAgentFile> {
  const parsed = await parseMarkdownWithFrontmatter(filePath, readFileContent, {
    folderFileName: "agent.md",
  });

  if (!parsed.ok) {
    if (parsed.error === "readError") {
      return {
        name: parsed.defaultName,
        filePath,
        error: "readError",
        message: parsed.message,
      } satisfies InvalidCustomAgentFile;
    }

    const isEmptyFrontmatter =
      parsed.message === "No definition found in the frontmatter of the file.";
    return {
      name: parsed.defaultName,
      filePath,
      error: "parseError",
      message: isEmptyFrontmatter ? EmptyFrontmatterMessage : parsed.message,
      systemPrompt: parsed.body,
    } satisfies InvalidCustomAgentFile;
  }

  const { defaultName, frontmatter, body: systemPrompt } = parsed;

  const parseResult = CustomAgentFrontmatter.safeParse(frontmatter);
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

  return {
    filePath,
    name: agentName,
    tools,
    description: frontmatterData.description,
    systemPrompt,
    model: frontmatterData.model,
    omitAgentsMd: frontmatterData.omitAgentsMd,
    _internal: frontmatterData._internal,
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
