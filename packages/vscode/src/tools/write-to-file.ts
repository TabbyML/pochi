import { DiffView } from "@/integrations/editor/diff-view";
import { getLogger } from "@/lib/logger";
import { writeTextDocument } from "@/lib/write-text-document";
import { fixCodeGenerationOutput } from "@getpochi/common/message-utils";
import type {
  ClientTools,
  PreviewToolFunctionType,
  ToolFunctionType,
} from "@getpochi/tools";

const logger = getLogger("writeToFileTool");

export const previewWriteToFile: PreviewToolFunctionType<
  ClientTools["writeToFile"]
> = async (args, { state, toolCallId, abortSignal }) => {
  const { path, content } = args || {};
  if (path === undefined || content === undefined) return;

  try {
    const processedContent = fixCodeGenerationOutput(content);

    const diffView = await DiffView.getOrCreate(toolCallId, path);
    await diffView.update(
      processedContent,
      state !== "partial-call",
      abortSignal,
    );
  } catch (error) {
    DiffView.revertAndClose(toolCallId);
    throw error;
  }
};

/**
 * Implements the writeToFile tool for VSCode extension.
 * Writes content to a specified file, creating directories if needed.
 */
export const writeToFile: ToolFunctionType<ClientTools["writeToFile"]> = async (
  { path, content },
  { toolCallId, abortSignal, nonInteractive },
) => {
  try {
    const processedContent = fixCodeGenerationOutput(content);

    if (nonInteractive) {
      const edits = await writeTextDocument(
        path,
        processedContent,
        abortSignal,
      );
      logger.debug(
        `Successfully wrote content to ${path} in non-interactive mode`,
      );
      return { success: true, ...edits };
    }

    const diffView = await DiffView.getOrCreate(toolCallId, path);
    await diffView.update(processedContent, true);
    const edits = await diffView.saveChanges(path, processedContent);
    return { success: true, ...edits };
  } catch (error) {
    DiffView.revertAndClose(toolCallId);
    throw error;
  }
};
