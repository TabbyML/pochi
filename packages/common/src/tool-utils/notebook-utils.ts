export interface NotebookCell {
  id?: string;
  source: string | string[];
}

export interface NotebookContent {
  cells: NotebookCell[];
}

/**
 * Validates that a file path is a Jupyter notebook file
 */
export function validateNotebookPath(filePath: string): void {
  if (!filePath.endsWith(".ipynb")) {
    throw new Error("File must be a Jupyter notebook (.ipynb)");
  }
}

/**
 * Validates that a notebook has the correct structure
 */
export function validateNotebookStructure(notebook: unknown): void {
  if (
    !notebook ||
    typeof notebook !== "object" ||
    !("cells" in notebook) ||
    !Array.isArray((notebook as NotebookContent).cells)
  ) {
    throw new Error("Invalid notebook format: no cells array found");
  }
}

/**
 * Parses a notebook from JSON string
 */
export function parseNotebook(content: string): NotebookContent {
  const notebook = JSON.parse(content);
  validateNotebookStructure(notebook);
  return notebook as NotebookContent;
}

/**
 * Edits a cell in a notebook by its ID or index
 * @param notebook The notebook to edit
 * @param cellId The cell ID or index (as string)
 * @param newContent The new content for the cell
 * @returns The updated notebook
 * @throws Error if the cell is not found
 */
export function editNotebookCell(
  notebook: NotebookContent,
  cellId: string,
  newContent: string,
): NotebookContent {
  let cellFound = false;

  for (let i = 0; i < notebook.cells.length; i++) {
    const cell = notebook.cells[i];
    const currentCellId = cell.id;

    if (currentCellId === cellId || i.toString() === cellId) {
      notebook.cells[i].source = newContent;
      cellFound = true;
      break;
    }
  }

  if (!cellFound) {
    throw new Error(`Cell with ID "${cellId}" not found in notebook`);
  }

  return notebook;
}

/**
 * Serializes a notebook to JSON string
 */
export function serializeNotebook(notebook: NotebookContent): string {
  return JSON.stringify(notebook, null, 2);
}
