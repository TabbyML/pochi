import {
  editNotebookCell,
  getFileModificationTime,
  parseNotebook,
  serializeNotebook,
  validateNotebookPath,
  withFileStateCacheGuard,
} from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import type { ToolCallOptions } from "../types";

/**
 * Implements the editNotebook tool for CLI.
 * Edits a specific cell in a Jupyter notebook by its cell ID.
 */
export const editNotebook =
  ({
    fileSystem,
    fileStateCache,
  }: ToolCallOptions): ToolFunctionType<ClientTools["editNotebook"]> =>
  async ({ path: filePath, cellId, content }, { cwd }) => {
    try {
      validateNotebookPath(filePath);

      return await withFileStateCacheGuard({
        cache: fileStateCache,
        path: filePath,
        cwd,
        getMtime: getFileModificationTime,
        operation: "editing",
        doWork: async () => {
          const fileBuffer = await fileSystem.readFile(filePath);
          const fileContent = new TextDecoder().decode(fileBuffer);

          const notebook = parseNotebook(fileContent);
          const updatedNotebook = editNotebookCell(notebook, cellId, content);
          const serialized = serializeNotebook(updatedNotebook);

          await fileSystem.writeFile(filePath, serialized);

          return { result: { success: true as const }, newContent: serialized };
        },
      });
    } catch (error) {
      return { success: false };
    }
  };
