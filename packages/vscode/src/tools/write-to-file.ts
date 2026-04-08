import { getVscodeFileMtime } from "@/lib/fs";
import { getLogger } from "@/lib/logger";
import { writeTextDocument } from "@/lib/write-text-document";
import { fixCodeGenerationOutput } from "@getpochi/common/message-utils";
import { withFileStateCacheGuard } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

const logger = getLogger("writeToFileTool");

/**
 * Implements the writeToFile tool for VSCode extension.
 * Writes content to a specified file, creating directories if needed.
 */
export const writeToFile: ToolFunctionType<ClientTools["writeToFile"]> = async (
  { path, content },
  options,
) => {
  const { abortSignal, cwd } = options;

  return withFileStateCacheGuard({
    cache: options.fileStateCache,
    path,
    cwd,
    getMtime: getVscodeFileMtime,
    operation: "writing",
    doWork: async () => {
      const processedContent = fixCodeGenerationOutput(content);

      const edits = await writeTextDocument(
        path,
        processedContent,
        cwd,
        abortSignal,
      );
      logger.debug(`Successfully wrote content to ${path}`);

      return {
        result: { success: true as const, ...edits },
        fileCacheContent: processedContent,
      };
    },
  });
};
