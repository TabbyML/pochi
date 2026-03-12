import { ensureFileDirectoryExists } from "@/lib/fs";
import { getLogger } from "@/lib/logger";
import { writeTextDocument } from "@/lib/write-text-document";
import { parseDiffAndApply } from "@getpochi/common/diff-utils";
import { resolvePath, validateTextFile } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import * as vscode from "vscode";

const logger = getLogger("applyDiffTool");

export const applyDiff: ToolFunctionType<ClientTools["applyDiff"]> = async (
  { path, searchContent, replaceContent, expectedReplacements },
  { abortSignal, cwd },
) => {
  const resolvedPath = resolvePath(path, cwd);
  const fileUri = vscode.Uri.file(resolvedPath);
  await ensureFileDirectoryExists(fileUri);

  const fileBuffer = await vscode.workspace.fs.readFile(fileUri);
  validateTextFile(fileBuffer);

  const fileContent = fileBuffer.toString();

  const updatedContent = await parseDiffAndApply(
    fileContent,
    searchContent,
    replaceContent,
    expectedReplacements,
  );

  const edits = await writeTextDocument(path, updatedContent, cwd, abortSignal);
  logger.info(`Successfully applied diff to ${path}`);
  return { success: true, ...edits };
};
