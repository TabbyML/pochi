import * as fs from "node:fs/promises";
import { resolvePath } from "@getpochi/common/tool-utils";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

interface NotebookCell {
  id?: string;
  source: string | string[];
}

interface NotebookContent {
  cells: NotebookCell[];
}

export const editNotebook: ToolFunctionType<
  ClientTools["editNotebook"]
> = async ({ path: filePath, cellId, content }, { cwd }) => {
  try {
    const absolutePath = resolvePath(filePath, cwd);

    if (!absolutePath.endsWith(".ipynb")) {
      throw new Error("File must be a Jupyter notebook (.ipynb)");
    }

    const fileContent = await fs.readFile(absolutePath, "utf-8");
    const notebook: NotebookContent = JSON.parse(fileContent);

    if (!notebook.cells || !Array.isArray(notebook.cells)) {
      throw new Error("Invalid notebook format: no cells array found");
    }

    let cellFound = false;

    for (let i = 0; i < notebook.cells.length; i++) {
      const cell = notebook.cells[i];

      const currentCellId = cell.id;

      if (currentCellId === cellId || i.toString() === cellId) {
        notebook.cells[i].source = content;
        cellFound = true;
        break;
      }
    }

    if (!cellFound) {
      throw new Error(`Cell with ID "${cellId}" not found in notebook`);
    }

    const updatedContent = JSON.stringify(notebook, null, 2);
    await fs.writeFile(absolutePath, updatedContent, "utf-8");

    return { success: true };
  } catch (error) {
    return { success: false };
  }
};
