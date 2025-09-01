import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import { fixCodeGenerationOutput } from "@getpochi/common/message-utils";
import { isFileExists, resolvePath } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

/**
 * Implements the writeToFile tool for runner.
 * Writes content to a specified file, creating directories if needed.
 */
export const writeToFile =
  (context: ToolCallOptions): ToolFunctionType<ClientTools["writeToFile"]> =>
  async ({ path, content }) => {
    const filePath = resolvePath(path, context.cwd);
    if (!(await isFileExists(filePath))) {
      const dirPath = nodePath.dirname(filePath);
      await fs.mkdir(dirPath, { recursive: true });
    }
    const processedContent = fixCodeGenerationOutput(content);
    await fs.writeFile(filePath, processedContent);
    return { success: true };
  };
