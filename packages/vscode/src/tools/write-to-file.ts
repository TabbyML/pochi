import { createPrettyPatch, isFileExists } from "@/lib/fs";
import { getLogger } from "@/lib/logger";
import { getEditSummary, writeTextDocument } from "@/lib/write-text-document";
import { fixCodeGenerationOutput } from "@getpochi/common/message-utils";
import { resolvePath } from "@getpochi/common/tool-utils";
import type {
  ClientTools,
  PreviewToolFunctionType,
  ToolFunctionType,
} from "@getpochi/tools";
import * as vscode from "vscode";

const logger = getLogger("writeToFileTool");

export const previewWriteToFile: PreviewToolFunctionType<
  ClientTools["writeToFile"]
> = async (args, { cwd }) => {
  const { path, content } = args || {};
  if (path === undefined || content === undefined)
    return { error: "Invalid arguments for previewing writeToFile tool." };

  const processedContent = fixCodeGenerationOutput(content);

  let fileUri: vscode.Uri;
  if (path.startsWith("pochi://")) {
    fileUri = vscode.Uri.parse(path);
  } else {
    const resolvedPath = resolvePath(path, cwd);
    fileUri = vscode.Uri.file(resolvedPath);
  }

  const fileExists = await isFileExists(fileUri);
  const fileContent = fileExists
    ? (await vscode.workspace.fs.readFile(fileUri)).toString()
    : "";
  const editSummary = getEditSummary(fileContent, processedContent);
  const edit = createPrettyPatch(path, fileContent, processedContent);
  return { success: true, _meta: { edit, editSummary } };
};

/**
 * Implements the writeToFile tool for VSCode extension.
 * Writes content to a specified file, creating directories if needed.
 */
export const writeToFile: ToolFunctionType<ClientTools["writeToFile"]> = async (
  { path, content },
  { abortSignal, cwd },
) => {
  const processedContent = fixCodeGenerationOutput(content);

  const edits = await writeTextDocument(
    path,
    processedContent,
    cwd,
    abortSignal,
  );
  logger.debug(`Successfully wrote content to ${path}`);
  return { success: true, ...edits };
};
