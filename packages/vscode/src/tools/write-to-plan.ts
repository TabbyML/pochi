import { ensureFileDirectoryExists } from "@/lib/fs";
import { getLogger } from "@/lib/logger";
import { writeTextDocument } from "@/lib/write-text-document";
import { resolvePath } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import * as vscode from "vscode";

const logger = getLogger("writeToPlan");

/**
 * Implements the writePlan tool for VSCode extension.
 * Writes content to the .pochi/plans/${taskId}.md file, creating directories if needed.
 */
export const writeToPlan: ToolFunctionType<ClientTools["writeToPlan"]> = async (
  { content },
  { abortSignal, cwd, taskId },
) => {
  const implementationPlanPath = resolvePath(`.pochi/plans/${taskId}.md`, cwd);

  const fileUri = vscode.Uri.file(implementationPlanPath);
  await ensureFileDirectoryExists(fileUri);

  await writeTextDocument(implementationPlanPath, content, cwd, abortSignal);

  logger.debug("Successfully wrote implementation plan");
  return { success: true };
};
