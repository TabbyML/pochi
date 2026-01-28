import {
  editNotebookCell,
  parseNotebook,
  serializeNotebook,
  validateNotebookPath,
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
  }: ToolCallOptions): ToolFunctionType<ClientTools["editNotebook"]> =>
  async ({ path: filePath, cellId, content }) => {
    try {
      // validateNotebookPath checks extension .ipynb.
      // It assumes path is string.
      // If VFS, we might skip validation or validate on the URI.
      // validateNotebookPath throws if not .ipynb
      validateNotebookPath(filePath);

      const fileBuffer = await fileSystem.readFile(filePath);
      const fileContent = new TextDecoder().decode(fileBuffer);

      const notebook = parseNotebook(fileContent);
      const updatedNotebook = editNotebookCell(notebook, cellId, content);
      const serialized = serializeNotebook(updatedNotebook);

      await fileSystem.writeFile(filePath, serialized);

      return { success: true };
    } catch (error) {
      return { success: false };
    }
  };
