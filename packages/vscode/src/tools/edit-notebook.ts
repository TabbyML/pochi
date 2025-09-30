import * as vscode from "vscode";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";
import * as path from "node:path";
import * as fs from "node:fs/promises";

interface NotebookCell {
  id?: string;
  cell_type: "code" | "markdown" | "raw";
  source: string | string[];
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  metadata?: Record<string, any>;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  outputs?: any[];
  execution_count?: number | null;
}

interface NotebookContent {
  cells: NotebookCell[];
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  metadata?: Record<string, any>;
  nbformat?: number;
  nbformat_minor?: number;
}

export const editNotebook: ToolFunctionType<
  ClientTools["editNotebook"]
> = async ({ path: filePath, cellId, content }) => {
  try {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
      return { success: false };
    }

    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(workspacePath, filePath);

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
