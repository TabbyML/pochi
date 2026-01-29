import { fixCodeGenerationOutput } from "@getpochi/common/message-utils";

import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

/**
 * Implements the writeToFile tool for runner.
 * Writes content to a specified file, creating directories if needed.
 */
export const writeToFile =
  ({
    fileSystem,
  }: ToolCallOptions): ToolFunctionType<ClientTools["writeToFile"]> =>
  async ({ path, content }) => {
    const processedContent = fixCodeGenerationOutput(content);
    await fileSystem.writeFile(path, processedContent);
    return { success: true };
  };
