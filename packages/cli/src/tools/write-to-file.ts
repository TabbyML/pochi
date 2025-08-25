import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import { fixCodeGenerationOutput } from "@getpochi/common/message-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

/**
 * Implements the writeToFile tool for runner.
 * Writes content to a specified file, creating directories if needed.
 */
export const writeToFile =
  (context: ToolCallOptions): ToolFunctionType<ClientTools["writeToFile"]> =>
  async ({ path, content }) => {
    const fileUri = nodePath.join(context.cwd, path);
    const processedContent = fixCodeGenerationOutput(content);
    await fs.writeFile(fileUri, processedContent);
    return { success: true };
  };
