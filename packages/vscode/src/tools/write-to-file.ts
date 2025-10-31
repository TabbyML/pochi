import { DiffView } from "@/integrations/editor/diff-view";
import { createPrettyPatch } from "@/lib/fs";
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
> = async (args, { state, toolCallId, abortSignal, cwd, nonInteractive }) => {
  const { path, content } = args || {};
  if (path === undefined || content === undefined)
    return { error: "Invalid arguments for previewing writeToFile tool." };

  try {
    const processedContent = fixCodeGenerationOutput(content);

    if (nonInteractive) {
      const resolvedPath = resolvePath(path, cwd);
      const fileUri = vscode.Uri.file(resolvedPath);

      const fileBuffer = await vscode.workspace.fs.readFile(fileUri);
      const fileContent = fileBuffer.toString();
      const editSummary = getEditSummary(fileContent, processedContent);
      const edit = createPrettyPatch(path, fileContent, processedContent);
      return { success: true, _meta: { edit, editSummary } };
    }

    const diffView = await DiffView.getOrCreate(toolCallId, path, cwd);
    await diffView.update(
      processedContent,
      state !== "partial-call",
      abortSignal,
    );
    return { success: true };
  } catch (error) {
    if (state === "call") {
      DiffView.revertAndClose(toolCallId);
    }
    throw error;
  }
};

/**
 * Implements the writeToFile tool for VSCode extension.
 * Writes content to a specified file, creating directories if needed.
 */
export const writeToFile: ToolFunctionType<ClientTools["writeToFile"]> = async (
  { path, content },
  { toolCallId, abortSignal, nonInteractive, cwd },
) => {
  try {
    const processedContent = fixCodeGenerationOutput(content);

    if (nonInteractive) {
      const edits = await writeTextDocument(
        path,
        processedContent,
        cwd,
        abortSignal,
      );
      logger.debug(
        `Successfully wrote content to ${path} in non-interactive mode`,
      );
      return { success: true, ...edits };
    }

    const diffView = await DiffView.getOrCreate(toolCallId, path, cwd);
    await diffView.update(processedContent, true);
    const edits = await diffView.saveChanges(path, processedContent);
    return { success: true, ...edits };
  } catch (error) {
    DiffView.revertAndClose(toolCallId);
    throw error;
  }
};
