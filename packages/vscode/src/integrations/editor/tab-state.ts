import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { PochiTaskEditorProvider } from "../webview/webview-panel";

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

  constructor() {
    this.activeSelection.value = getActiveSelection();
    this.activeTabs.value = listOpenTabs();
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
    const newOpenTabs = listOpenTabs();
    this.activeTabs.value = newOpenTabs;

    const newSelection = getActiveSelection();
    if (newSelection) {
      this.activeSelection.value = newSelection;
    } else if (this.activeSelection.value) {
      // newSelection is undefined, but there was a previous selection.
      // Check if the file for the previous selection is still open.
      const lastSelectedFilepath = this.activeSelection.value.filepath;
      const isFileStillOpen = newOpenTabs.some(
        (tab) => tab.filepath === lastSelectedFilepath,
      );
      if (!isFileStillOpen) {
        // The file was likely closed, so clear the selection.
        this.activeSelection.value = undefined;
      }
      // If the file is still open, we preserve the selection (e.g. when focusing a webview).
    }
  };

  private onSelectionChanged = () => {
    const newSelection = getActiveSelection();
    if (newSelection !== undefined) {
      this.activeSelection.value = newSelection;
    }
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

function getActiveSelection(): FileSelection | undefined {
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor?.document && activeEditor.document.uri.scheme === "file") {
    const selection = activeEditor.selection;
    return {
      filepath: activeEditor.document.uri.fsPath,
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
          filepath: notebook.uri.fsPath,
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

function listOpenTabs(): { filepath: string; isDir: boolean }[] {
  const currentOpenTabFiles: { filepath: string; isDir: boolean }[] = [];
  const processedFilepaths = new Set<string>(); // To ensure uniqueness by final relative filepath

  // Prioritize active editor
  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor?.document) {
    const filepath = activeEditor.document.uri.fsPath;
    if (!processedFilepaths.has(filepath)) {
      currentOpenTabFiles.push({ filepath: filepath, isDir: false });
      processedFilepaths.add(filepath);
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
      } else if (
        tab.input instanceof vscode.TabInputCustom &&
        tab.input.uri.scheme !== PochiTaskEditorProvider.scheme
      ) {
        uri = tab.input.uri;
      }
      // Other tab input types like vscode.TabInputWebview or vscode.TabInputTerminal are generally not considered file-backed code editors.

      if (uri) {
        const filepath = uri.fsPath;
        if (!processedFilepaths.has(filepath)) {
          currentOpenTabFiles.push({ filepath: filepath, isDir: false });
          processedFilepaths.add(filepath);
        }
      }
    }
  }
  return currentOpenTabFiles;
}
