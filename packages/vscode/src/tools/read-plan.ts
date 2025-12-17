import { readFileContent } from "@/lib/fs";
import { resolvePath } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

/**
 * Implements the readPlan tool for VSCode extension.
 * read content from the .pochi/plans/${taskId}.md file.
 */
export const readPlan: ToolFunctionType<ClientTools["readPlan"]> = async (
  _params,
  { cwd, taskId },
) => {
  const implementationPlanPath = resolvePath(`.pochi/plans/${taskId}.md`, cwd);
  const content = await readFileContent(implementationPlanPath);

  return { content: content || "" };
};
