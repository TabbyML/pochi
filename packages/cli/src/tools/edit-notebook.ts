import * as fs from "node:fs/promises";
import {
  editNotebookCell,
  parseNotebook,
  resolvePath,
  serializeNotebook,
  validateNotebookPath,
} from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

/**
 * Implements the editNotebook tool for CLI.
 * Edits a specific cell in a Jupyter notebook by its cell ID.
 */
export const editNotebook =
  (): ToolFunctionType<ClientTools["editNotebook"]> =>
  async ({ path: filePath, cellId, content }, { cwd }) => {
    try {
      const absolutePath = resolvePath(filePath, cwd);
      validateNotebookPath(absolutePath);

      const fileContent = await fs.readFile(absolutePath, "utf-8");
      const notebook = parseNotebook(fileContent);
      const updatedNotebook = editNotebookCell(notebook, cellId, content);
      const serialized = serializeNotebook(updatedNotebook);

      await fs.writeFile(absolutePath, serialized, "utf-8");

      return { success: true };
    } catch (error) {
      return { success: false };
    }
  };
