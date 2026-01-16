import { createPrettyPatch, isFileExists, resolveFileUri } from "@/lib/fs";
import { getLogger } from "@/lib/logger";
import { getEditSummary, writeTextDocument } from "@/lib/write-text-document";
import { fixCodeGenerationOutput } from "@getpochi/common/message-utils";
import type {
  ClientTools,
  PreviewToolFunctionType,
  ToolFunctionType,
} from "@getpochi/tools";
import * as vscode from "vscode";

const logger = getLogger("writeToFileTool");

export const previewWriteToFile: PreviewToolFunctionType<
  ClientTools["writeToFile"]
> = async (args, { cwd, task }) => {
  const { path, content } = args || {};
  if (path === undefined || content === undefined)
    return { error: "Invalid arguments for previewing writeToFile tool." };

  const processedContent = fixCodeGenerationOutput(content);

  const fileUri = resolveFileUri(path, { cwd, task });

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
  { abortSignal, cwd, task },
) => {
  const processedContent = fixCodeGenerationOutput(content);
  const edits = await writeTextDocument(
    path,
    processedContent,
    cwd,
    abortSignal,
    task,
  );
  logger.debug(`Successfully wrote content to ${path}`);
  return { success: true, ...edits };
};
