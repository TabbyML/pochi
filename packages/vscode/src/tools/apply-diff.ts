import { DiffView } from "@/integrations/editor/diff-view";
import { ensureFileDirectoryExists } from "@/lib/fs";
import { getLogger } from "@/lib/logger";
import { writeTextDocument } from "@/lib/write-text-document";
import { parseDiffAndApply } from "@getpochi/common/diff-utils";
import { validateTextFile } from "@getpochi/common/tool-utils";
import type { ClientTools } from "@getpochi/tools";
import type {
  PreviewToolFunctionType,
  ToolFunctionType,
} from "@getpochi/tools";
import * as vscode from "vscode";

const logger = getLogger("applyDiffTool");

/**
 * Preview the diff using DiffView
 */
export const previewApplyDiff: PreviewToolFunctionType<
  ClientTools["applyDiff"]
> = async (args, { toolCallId, state, abortSignal, cwd }) => {
  const { path, searchContent, replaceContent, expectedReplacements } =
    args || {};
  if (
    !args ||
    !path ||
    searchContent === undefined ||
    replaceContent === undefined
  ) {
    return;
  }

  try {
    const fileUri = vscode.Uri.joinPath(vscode.Uri.parse(cwd), path);

    const fileBuffer = await vscode.workspace.fs.readFile(fileUri);
    validateTextFile(fileBuffer);

    const fileContent = fileBuffer.toString();

    const updatedContent = await parseDiffAndApply(
      fileContent,
      searchContent,
      replaceContent,
      expectedReplacements,
    );

    const diffView = await DiffView.getOrCreate(toolCallId, path, cwd);
    await diffView.update(
      updatedContent,
      state !== "partial-call",
      abortSignal,
    );
  } catch (error) {
    DiffView.revertAndClose(toolCallId);
    throw error;
  }
};

/**
 * Apply a diff to a file using DiffView
 */
export const applyDiff: ToolFunctionType<ClientTools["applyDiff"]> = async (
  { path, searchContent, replaceContent, expectedReplacements },
  { toolCallId, abortSignal, nonInteractive, cwd },
) => {
  try {
    const fileUri = vscode.Uri.joinPath(vscode.Uri.parse(cwd), path);
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

    if (nonInteractive) {
      const edits = await writeTextDocument(
        path,
        updatedContent,
        cwd,
        abortSignal,
      );
      logger.info(
        `Successfully applied diff to ${path} in non-interactive mode`,
      );
      return { success: true, ...edits };
    }

    const diffView = await DiffView.getOrCreate(toolCallId, path, cwd);
    await diffView.update(updatedContent, true);
    const edits = await diffView.saveChanges(path, updatedContent);

    logger.info(`Successfully applied diff to ${path}`);
    return { success: true, ...edits };
  } catch (error) {
    DiffView.revertAndClose(toolCallId);
    throw error;
  }
};
