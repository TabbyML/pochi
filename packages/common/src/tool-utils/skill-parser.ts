import z from "zod";
import type {
  InvalidSkillFile,
  SkillFile,
  ValidSkillFile,
} from "../vscode-webui-bridge";
import { parseMarkdownWithFrontmatter } from "./markdown-frontmatter";

const SkillFrontmatter = z.object({
  name: z.string(),
  description: z.string(),
  license: z.string().optional(),
  compatibility: z.string().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  "allowed-tools": z.string().optional(),
});

const EmptyFrontmatterMessage =
  "No skill definition found in the frontmatter of the file.";

export async function parseSkillFile(
  filePath: string,
  readFileContent: (filePath: string) => Promise<string>,
): Promise<SkillFile> {
  const parsed = await parseMarkdownWithFrontmatter(filePath, readFileContent, {
    folderFileName: "skill.md",
  });

  if (!parsed.ok) {
    if (parsed.error === "readError") {
      return {
        name: parsed.defaultName,
        filePath,
        error: "readError",
        message: parsed.message,
      } satisfies InvalidSkillFile;
    }

    const isEmptyFrontmatter =
      parsed.message === "No definition found in the frontmatter of the file.";
    return {
      name: parsed.defaultName,
      filePath,
      error: "parseError",
      message: isEmptyFrontmatter ? EmptyFrontmatterMessage : parsed.message,
      instructions: parsed.body,
    } satisfies InvalidSkillFile;
  }

  const { defaultName, frontmatter, body: instructions } = parsed;

  const parseResult = SkillFrontmatter.safeParse(frontmatter);
  if (!parseResult.success) {
    return {
      name: defaultName,
      filePath,
      error: "validationError",
      message: z.prettifyError(parseResult.error),
      instructions,
    } satisfies InvalidSkillFile;
  }

  const frontmatterData = parseResult.data;
  const skillName = frontmatterData.name || defaultName;

  return {
    filePath,
    name: skillName,
    description: frontmatterData.description,
    license: frontmatterData.license,
    compatibility: frontmatterData.compatibility,
    metadata: frontmatterData.metadata,
    allowedTools: frontmatterData["allowed-tools"],
    instructions,
  } satisfies ValidSkillFile;
}
