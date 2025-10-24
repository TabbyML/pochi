import { asRelativePath } from "@/lib/fs";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceScope } from "@/lib/workspace-scoped";
import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

export type FileSelection = {
  filepath: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  content: string;
  notebookCell?: {
    cellIndex: number;
    cellId: string;
  };
};

@injectable()
@singleton()
export class TabState implements vscode.Disposable {
  // Signal containing the current active tabs
  activeTabs = signal([] as { filepath: string; isDir: boolean }[]);

  activeSelection = signal<FileSelection | undefined>();

  private disposables: vscode.Disposable[] = [];

  constructor(private readonly workspaceScope: WorkspaceScope) {
    this.activeSelection.value = getActiveSelection(this.workspaceScope.cwd);
    this.activeTabs.value = listOpenTabs(this.workspaceScope.cwd);
    this.setupEventListeners();
  }

  /**
   * Set up listeners for tab changes and active editor changes
   */
  private setupEventListeners() {
    // Set up tab change detection
    this.disposables.push(
      vscode.window.tabGroups.onDidChangeTabs(this.onTabChanged),
    );

    // Also update when active editor changes
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(this.onTabChanged),
    );

    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection(this.onSelectionChanged),
    );

    // Add notebook editor listeners
    this.disposables.push(
      vscode.window.onDidChangeActiveNotebookEditor(this.onTabChanged),
    );

    this.disposables.push(
      vscode.window.onDidChangeNotebookEditorSelection(this.onSelectionChanged),
    );
  }

  /**
   * Update the active tabs signal when tabs change
   */
  private onTabChanged = () => {
    // Update the existing signal value instead of creating a new signal
    this.activeTabs.value = listOpenTabs(this.workspaceScope.cwd);
    this.activeSelection.value = getActiveSelection(this.workspaceScope.cwd);
  };

  private onSelectionChanged = () => {
    this.activeSelection.value = getActiveSelection(this.workspaceScope.cwd);
  };

  /**
   * Release all resources held by this class
   */
  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

function getActiveSelection(cwd: string | null): FileSelection | undefined {
  if (!cwd) {
    return undefined;
  }
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor?.document && activeEditor.document.uri.scheme === "file") {
    const selection = activeEditor.selection;
    const relativePath = asRelativePath(activeEditor.document.uri, cwd);
    return {
      filepath: relativePath,
      range: {
        start: {
          line: selection.start.line,
          character: selection.start.character,
        },
        end: {
          line: selection.end.line,
          character: selection.end.character,
        },
      },
      content: activeEditor.document.getText(selection),
    };
  }

  const activeNotebookEditor = vscode.window.activeNotebookEditor;
  if (activeNotebookEditor?.notebook) {
    const notebook = activeNotebookEditor.notebook;
    const relativePath = asRelativePath(notebook.uri, cwd);

    // Get the active cell selection
    const activeCell = activeNotebookEditor.selection?.start;
    if (activeCell !== undefined) {
      const cell = notebook.cellAt(activeCell);
      if (cell) {
        const cellDocument = cell.document;

        const cellTextEditor = vscode.window.visibleTextEditors.find(
          (editor) =>
            editor.document.uri.toString() === cellDocument.uri.toString(),
        );

        const selection =
          cellTextEditor?.selection ||
          new vscode.Selection(0, 0, cellDocument.lineCount, 0);
        const content = cellTextEditor
          ? cellDocument.getText(selection)
          : cellDocument.getText();

        return {
          filepath: relativePath,
          range: {
            start: {
              line: selection.start.line,
              character: selection.start.character,
            },
            end: {
              line: selection.end.line,
              character: selection.end.character,
            },
          },
          content: content,
          notebookCell: {
            cellIndex: activeCell,
            cellId: cell.metadata.id || activeCell.toString(),
          },
        };
      }
    }
  }

  return undefined;
}

function listOpenTabs(
  cwd: string | null,
): { filepath: string; isDir: boolean }[] {
  if (!cwd) {
    return [];
  }
  const currentOpenTabFiles: { filepath: string; isDir: boolean }[] = [];
  const processedFilepaths = new Set<string>(); // To ensure uniqueness by final relative filepath

  // Prioritize active editor
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor?.document) {
    const relativePath = asRelativePath(activeEditor.document.uri, cwd);
    if (!processedFilepaths.has(relativePath)) {
      currentOpenTabFiles.push({ filepath: relativePath, isDir: false });
      processedFilepaths.add(relativePath);
    }
  }

  for (const tabGroup of vscode.window.tabGroups.all) {
    for (const tab of tabGroup.tabs) {
      let uri: vscode.Uri | undefined;

      if (tab.input instanceof vscode.TabInputText) {
        uri = tab.input.uri;
      } else if (tab.input instanceof vscode.TabInputTextDiff) {
        uri = tab.input.modified;
      } else if (tab.input instanceof vscode.TabInputNotebook) {
        uri = tab.input.uri;
      } else if (tab.input instanceof vscode.TabInputNotebookDiff) {
        uri = tab.input.modified;
      } else if (tab.input instanceof vscode.TabInputCustom) {
        uri = tab.input.uri;
      }
      // Other tab input types like vscode.TabInputWebview or vscode.TabInputTerminal are generally not considered file-backed code editors.

      if (uri) {
        const relativePath = asRelativePath(uri, cwd);
        if (!processedFilepaths.has(relativePath)) {
          currentOpenTabFiles.push({ filepath: relativePath, isDir: false });
          processedFilepaths.add(relativePath);
        }
      }
    }
  }
  return currentOpenTabFiles;
}
