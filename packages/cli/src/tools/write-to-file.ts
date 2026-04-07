import { fixCodeGenerationOutput } from "@getpochi/common/message-utils";
import {
  getFileModificationTime,
  withFileStateCacheGuard,
} from "@getpochi/common/tool-utils";

import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

/**
 * Implements the writeToFile tool for runner.
 * Writes content to a specified file, creating directories if needed.
 */
export const writeToFile =
  ({
    fileSystem,
    fileStateCache,
  }: ToolCallOptions): ToolFunctionType<ClientTools["writeToFile"]> =>
  async ({ path, content }, { cwd }) => {
    return withFileStateCacheGuard({
      cache: fileStateCache,
      path,
      cwd,
      getMtime: getFileModificationTime,
      operation: "writing",
      doWork: async () => {
        const processedContent = fixCodeGenerationOutput(content);
        await fileSystem.writeFile(path, processedContent);

        return {
          result: { success: true as const },
          newContent: processedContent,
        };
      },
    });
  };
