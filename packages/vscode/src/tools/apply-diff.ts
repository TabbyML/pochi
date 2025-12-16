import { createPrettyPatch, ensureFileDirectoryExists } from "@/lib/fs";
import { getLogger } from "@/lib/logger";
import { getEditSummary, writeTextDocument } from "@/lib/write-text-document";
import { parseDiffAndApply } from "@getpochi/common/diff-utils";
import { resolvePath, validateTextFile } from "@getpochi/common/tool-utils";
import type { ClientTools } from "@getpochi/tools";
import type {
  PreviewToolFunctionType,
  ToolFunctionType,
} from "@getpochi/tools";
import * as vscode from "vscode";

const logger = getLogger("applyDiffTool");

export const previewApplyDiff: PreviewToolFunctionType<
  ClientTools["applyDiff"]
> = async (args, { cwd }) => {
  const { path, searchContent, replaceContent, expectedReplacements } =
    args || {};
  if (
    !args ||
    !path ||
    searchContent === undefined ||
    replaceContent === undefined
  ) {
    return { error: "Invalid arguments for previewing applyDiff tool." };
  }

  let fileUri: vscode.Uri;
  if (path.startsWith("pochi://")) {
    fileUri = vscode.Uri.parse(path);
  } else {
    const resolvedPath = resolvePath(path, cwd);
    fileUri = vscode.Uri.file(resolvedPath);
  }

  const fileBuffer = await vscode.workspace.fs.readFile(fileUri);
  validateTextFile(fileBuffer);

  const fileContent = fileBuffer.toString();

  const updatedContent = await parseDiffAndApply(
    fileContent,
    searchContent,
    replaceContent,
    expectedReplacements,
  );

  const editSummary = getEditSummary(fileContent, updatedContent);
  const edit = createPrettyPatch(path, fileContent, updatedContent);
  return { success: true, _meta: { edit, editSummary } };
};

export const applyDiff: ToolFunctionType<ClientTools["applyDiff"]> = async (
  { path, searchContent, replaceContent, expectedReplacements },
  { abortSignal, cwd },
) => {
  let fileUri: vscode.Uri;
  if (path.startsWith("pochi://")) {
    fileUri = vscode.Uri.parse(path);
  } else {
    const resolvedPath = resolvePath(path, cwd);
    fileUri = vscode.Uri.file(resolvedPath);
  }

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
