import * as fs from "node:fs/promises";
import {
  editNotebookCell,
  getFileStateCacheFromOptions,
  parseNotebook,
  serializeNotebook,
  validateNotebookPath,
  withFileStateCacheGuard,
} from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

/**
 * Get the modification time of a file via node:fs.
 * Returns Math.floor(mtimeMs) or undefined if the file doesn't exist.
 */
async function getNodeFileMtime(filePath: string): Promise<number | undefined> {
  try {
    const stat = await fs.stat(filePath);
    return Math.floor(stat.mtimeMs);
  } catch {
    return undefined;
  }
}

export const editNotebook: ToolFunctionType<
  ClientTools["editNotebook"]
> = async ({ path: filePath, cellId, content }, options) => {
  try {
    const { cwd } = options;
    const fileStateCache = getFileStateCacheFromOptions(options.fileStateCache);

    validateNotebookPath(filePath);

    return await withFileStateCacheGuard({
      cache: fileStateCache,
      path: filePath,
      cwd,
      getMtime: getNodeFileMtime,
      operation: "editing",
      doWork: async (resolvedPath) => {
        const fileContent = await fs.readFile(resolvedPath, "utf-8");
        const notebook = parseNotebook(fileContent);
        const updatedNotebook = editNotebookCell(notebook, cellId, content);
        const serialized = serializeNotebook(updatedNotebook);

        await fs.writeFile(resolvedPath, serialized, "utf-8");

        return { result: { success: true as const }, newContent: serialized };
      },
    });
  } catch (error) {
    return { success: false };
  }
};
