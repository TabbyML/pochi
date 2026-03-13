import { getLogger } from "@/lib/logger";
import { writeTextDocument } from "@/lib/write-text-document";
import { fixCodeGenerationOutput } from "@getpochi/common/message-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

const logger = getLogger("writeToFileTool");

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
